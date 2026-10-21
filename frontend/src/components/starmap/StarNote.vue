<template>
  <div class="block">
    <div class="block-title">描述 / 笔记</div>
    <textarea v-model="text" class="note-input" maxlength="1000"
              :placeholder="node.kind === 'topic' ? '这颗星球是做什么的？适合怎么复习？' : '用自己的话写一句：它是什么、什么时候用、易错点在哪'"
              :aria-label="node.kind === 'topic' ? '星球描述' : '知识点描述'"></textarea>
    <div class="note-foot">
      <span>{{ text.length }}/1000</span>
      <button class="btn" type="button" :disabled="!dirty" @click="save">保存描述</button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({ node: { type: Object, required: true } })
const emit = defineEmits(['save'])

const text = ref('')
watch(() => props.node, n => { text.value = n?.note || '' }, { immediate: true })

const dirty = computed(() => text.value !== (props.node?.note || ''))
function save() {
  const next = text.value.trim()
  text.value = next
  emit('save', next)
}
</script>
