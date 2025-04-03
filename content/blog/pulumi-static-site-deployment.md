---
date: 2025-03-31
tags: [pulumi, iac, nuxt, aws]
---

# Deploying a Static Site Using Nuxt, Pulumi (Infrastructure as Code), and AWS 🚀

While updating my portfolio, I stumbled across [a post on dev.to about Pulumi](https://dev.to/devteam/announcing-the-pulumi-deploy-and-document-challenge-3000-in-prizes-887). I found Pulumi interesting because how it makes [infrastructure as code](https://en.wikipedia.org/wiki/Infrastructure_as_code) more approachable with libraries in popular programming languages (TypeScript, Java, Go, etc.). Hopefully, I'd also be able to execute this script in any of my future apps for easy server provisioning.

## Goals for Automated Static Site Deployment

In order for me to consider this successful, each deployment should have the following:

- A private S3 bucket to hold static files.
    - In case we decide to place confidential files in this bucket, we should avoid setting the bucket to public read.
- A Cloudfront CDN that mirrors the S3 bucket.
    - Having a CDN for static sites is always a good thing, since it significantly improves load times due to caching and edge networks.
- Valid certificates and Route 53 Alias entries.

## Configuring Pulumi with AWS

Before starting, we want to make sure we have an IAM user set up with the correct permissions. Pulumi uses this user to successfuly create the resources we need. AWS [has a helpful guide to do so](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_users_create.html). These are the permissions that I set up for my IAM user.

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:CreateBucket",
                "s3:PutBucketOwnershipControls",
                "s3:PutBucketPublicAccessBlock",
                "s3:PutBucketAcl",
                "s3:PutObject",
                "s3:PutObjectAcl",
                "s3:GetObject",
                "s3:ListBucket",
                "s3:GetBucketLocation"
            ],
            "Resource": ["*"]
        }
    ]
}
```

Next, you'll need to setup configuration so that Pulumi can interact with AWS. [Instructions can be found here.](https://www.pulumi.com/registry/packages/aws/installation-configuration/)

## Installation

The first step is to create a new Pulumi project using the [AWS TypeScript template](https://github.com/pulumi/templates/tree/master/aws-typescript). This will scaffold a barebones project that we can use TypeScript to customize after we answer a few basic questions from the prompt.

```shell
mkdir deployment & cd deployment
pulumi new aws-typescript
```

In this newly scaffolded project, there will be an index.ts file that acts as the entry point for your deployment.

```js
// This creates the S3 bucket which will host our static files.
const bucket = new aws.s3.BucketV2('my-bucket')

const websiteConfiguration = new aws.s3.BucketWebsiteConfigurationV2(
    'website-configuration',
    {
        bucket: bucket.id,
        indexDocument: {
            suffix: 'index.html',
        },
    }
)
```

The next portion of the index file has to do with setting up valid certificate endpoints for your DNS (assuming you've created DNS records through AWS Route 53). Note that while your other services (such as your S3 bucket) can be in your desired region, your certificates **_must_** be created in the us-east-1 region.

```js
const hostedZoneId = aws.route53
    .getZone({ name: 'yourdomain.com' }, { async: true })
    .then((zone) => zone.zoneId)

// Per AWS, ACM certificate must be in the us-east-1 region.
const eastRegion = new aws.Provider('east', {
    profile: aws.config.profile,
    region: 'us-east-1',
})

const certificateConfig: aws.acm.CertificateArgs = {
    domainName: 'yourdomain.com',
    validationMethod: 'DNS',
    subjectAlternativeNames: ['www.yourdomain.com'],
}

const certificate = new aws.acm.Certificate('certificate', certificateConfig, {
    provider: eastRegion,
})

const certificateValidationDomain = new aws.route53.Record(
    `yourdomain.com-validation`,
    {
        name: certificate.domainValidationOptions[0].resourceRecordName,
        zoneId: hostedZoneId,
        type: certificate.domainValidationOptions[0].resourceRecordType,
        records: [certificate.domainValidationOptions[0].resourceRecordValue],
        ttl: 60 * 10,
    }
)

const wwwCertificateValidationDomain = new aws.route53.Record(
    `www.yourdomain.com-validation`,
    {
        name: certificate.domainValidationOptions[1].resourceRecordName,
        zoneId: hostedZoneId,
        type: certificate.domainValidationOptions[1].resourceRecordType,
        records: [certificate.domainValidationOptions[1].resourceRecordValue],
        ttl: 60 * 10,
    }
)

const certificateValidation = new aws.acm.CertificateValidation(
    'certificateValidation',
    {
        certificateArn: certificate.arn,
        validationRecordFqdns: [
            certificateValidationDomain.fqdn,
            wwwCertificateValidationDomain.fqdn,
        ],
    },
    { provider: eastRegion }
)

certificateArn = certificateValidation.certificateArn
```

The next portion makes sure that your S3 bucket is not accessible to the public. It also sets up the your Cloudflare CDN that will mirror your S3 bucket and make your website accessible.

```js
// Needed to set up S3 policies and make the bucket not public
const originAccessIdentity = new aws.cloudfront.OriginAccessIdentity(
    'originAccessIdentity'
)

// distributionArgs configures the CloudFront distribution.
const distributionArgs: aws.cloudfront.DistributionArgs = {
    enabled: true,
    aliases: ['yourdomain.com', 'www.yourdomain.com'],
    origins: [
        {
            originId: bucket.arn,
            domainName: bucket.bucketRegionalDomainName,
            s3OriginConfig: {
                originAccessIdentity:
                    originAccessIdentity.cloudfrontAccessIdentityPath,
            },
        },
    ],

    defaultRootObject: 'index.html',

    // A CloudFront distribution can configure different cache behaviors based on the request path.
    // Here we just specify a single, default cache behavior which is just read-only requests to S3.
    defaultCacheBehavior: {
        targetOriginId: bucket.arn,

        viewerProtocolPolicy: 'redirect-to-https',
        allowedMethods: ['GET', 'HEAD', 'OPTIONS'],
        cachedMethods: ['GET', 'HEAD', 'OPTIONS'],

        forwardedValues: {
            cookies: { forward: 'none' },
            queryString: false,
        },

        minTtl: 0,
        defaultTtl: 10 * 60,
        maxTtl: 10 * 60,
    },

    // "All" is the most broad distribution, and also the most expensive.
    // "100" is the least broad, and also the least expensive.
    priceClass: 'PriceClass_100',

    restrictions: {
        geoRestriction: {
            restrictionType: 'none',
        },
    },

    viewerCertificate: {
        acmCertificateArn: certificateArn, // Per AWS, ACM certificate must be in the us-east-1 region.
        sslSupportMethod: 'sni-only',
    },
}

const cdn = new aws.cloudfront.Distribution('cdn', distributionArgs)
```

The final lines of the index.ts file are the ones that actually create the Alias records in Route 53 and set the bucket's origin policy.

```js
const aliasRecord = new aws.route53.Record('yourdomain.com-alias', {
    name: 'yourdomain.com',
    zoneId: hostedZoneId,
    type: 'A',
    aliases: [
        {
            name: cdn.domainName,
            zoneId: cdn.hostedZoneId,
            evaluateTargetHealth: true,
        },
    ],
})

const wwwAliasRecord = new aws.route53.Record(`yourdomain.com-www-alias`, {
    name: `www.yourdomain.com`,
    zoneId: hostedZoneId,
    type: 'A',
    aliases: [
        {
            name: cdn.domainName,
            zoneId: cdn.hostedZoneId,
            evaluateTargetHealth: true,
        },
    ],
})

const bucketPolicy = new aws.s3.BucketPolicy('bucketPolicy', {
    bucket: bucket.id, // refer to the bucket created earlier
    policy: pulumi.jsonStringify({
        Version: '2012-10-17',
        Statement: [
            {
                Effect: 'Allow',
                Principal: {
                    AWS: originAccessIdentity.iamArn,
                }, // Only allow Cloudfront read access.
                Action: ['s3:GetObject'],
                Resource: [pulumi.interpolate`${bucket.arn}/*`], // Give Cloudfront access to the entire bucket.
            },
        ],
    }),
})
```

And that's the whole file! 🎉 We just need to run the following command to set up the infrastructure we just wrote in code.

```shell
pulumi up -y
```

Note that we still actually need to sync the static files in our S3 bucket. There are multiple ways to do this (including the aws-cli command), but for now, we can just upload the files to the bucket via the S3 bucket.
