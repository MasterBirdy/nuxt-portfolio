import * as pulumi from '@pulumi/pulumi'
import * as aws from '@pulumi/aws'

// Create an AWS resource (S3 Bucket)
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

let certificateArn: pulumi.Input<string>

const hostedZoneId = aws.route53
    .getZone({ name: 'mattito.net' }, { async: true })
    .then((zone) => zone.zoneId)

// Per AWS, ACM certificate must be in the us-east-1 region.
const eastRegion = new aws.Provider('east', {
    profile: aws.config.profile,
    region: 'us-east-1',
})

const certificateConfig: aws.acm.CertificateArgs = {
    domainName: 'mattito.net',
    validationMethod: 'DNS',
    subjectAlternativeNames: ['www.mattito.net'],
}

const certificate = new aws.acm.Certificate('certificate', certificateConfig, {
    provider: eastRegion,
})

const certificateValidationDomain = new aws.route53.Record(
    `mattito.net-validation`,
    {
        name: certificate.domainValidationOptions[0].resourceRecordName,
        zoneId: hostedZoneId,
        type: certificate.domainValidationOptions[0].resourceRecordType,
        records: [certificate.domainValidationOptions[0].resourceRecordValue],
        ttl: 60 * 10,
    }
)

const wwwCertificateValidationDomain = new aws.route53.Record(
    `www.mattito.net-validation`,
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

// Needed to set up S3 policies and make the bucket not public
const originAccessIdentity = new aws.cloudfront.OriginAccessIdentity(
    'originAccessIdentity'
)

// distributionArgs configures the CloudFront distribution.
const distributionArgs: aws.cloudfront.DistributionArgs = {
    enabled: true,
    aliases: ['mattito.net', 'www.mattito.net'],
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

const aliasRecord = new aws.route53.Record('mattito.net-alias', {
    name: 'mattito.net',
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

const wwwAliasRecord = new aws.route53.Record(`mattito.net-www-alias`, {
    name: `www.mattito.net`,
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
