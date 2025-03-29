<script setup lang="ts">
const { tag } = defineProps<{
    tag: String
}>()
</script>

<template>
    <div class="rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-800">
        {{ tag }}
    </div>
</template>
