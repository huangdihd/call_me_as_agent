<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  modelValue: unknown
  schema?: Record<string, unknown> | null
  name?: string
}>()

const emit = defineEmits(['update:modelValue'])

const isArray = computed(() => Array.isArray(props.modelValue))
const isObject = computed(() => typeof props.modelValue === 'object' && props.modelValue !== null && !isArray.value)

const updateValue = (val: unknown) => {
  emit('update:modelValue', val)
}

const updateArrayItem = (index: number, val: unknown) => {
  if (!Array.isArray(props.modelValue)) return
  const newArray = [...props.modelValue]
  newArray[index] = val
  updateValue(newArray)
}

const addArrayItem = () => {
  const newArray = [...(Array.isArray(props.modelValue) ? props.modelValue : [])]
  const itemSchema = (props.schema?.items as Record<string, unknown>) || {}

  let newItem: unknown = ''
  if (itemSchema.type === 'object') {
    const obj: Record<string, unknown> = {}
    if (itemSchema.properties) {
      const props = itemSchema.properties as Record<string, Record<string, unknown>>
      Object.keys(props).forEach((k) => {
        obj[k] = props[k].type === 'array' ? [] : (props[k].type === 'object' ? {} : '')
      })
    }
    newItem = obj
  } else if (itemSchema.type === 'array') {
    newItem = []
  }

  if (props.name === 'questions' && !itemSchema.properties) {
    newItem = { question: 'New question?', header: 'Info', type: 'text' }
  }

  newArray.push(newItem)
  updateValue(newArray)
}

const removeArrayItem = (index: number) => {
  if (!Array.isArray(props.modelValue)) return
  const newArray = [...props.modelValue]
  newArray.splice(index, 1)
  updateValue(newArray)
}

const updateObjectKey = (key: string, val: unknown) => {
  if (typeof props.modelValue !== 'object' || props.modelValue === null) return
  const newObj = { ...props.modelValue, [key]: val }
  updateValue(newObj)
}

const addObjectKey = () => {
  if (typeof props.modelValue !== 'object' || props.modelValue === null) return
  const key = window.prompt('Enter new property name:')
  if (key && !(props.modelValue as Record<string, unknown>)[key]) {
    updateObjectKey(key, '')
  }
}

const removeObjectKey = (key: string) => {
  if (typeof props.modelValue !== 'object' || props.modelValue === null) return
  const newObj = { ...props.modelValue } as Record<string, unknown>
  delete newObj[key]
  updateValue(newObj)
}
</script>

<template>
  <div class="w-full">
    <!-- Parameter Description (The missing part) -->
    <div
      v-if="schema?.description"
      class="text-[10px] text-gray-400 mb-1 leading-tight italic"
    >
      {{ schema.description }}
    </div>

    <template v-if="isArray">
      <div class="space-y-2 border-l-2 border-primary-200 dark:border-primary-900 pl-3 ml-1 mt-1">
        <div
          v-for="(item, idx) in modelValue"
          :key="idx"
          class="relative group p-3 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 shadow-sm"
        >
          <UButton
            icon="i-lucide-x"
            size="xs"
            color="error"
            variant="soft"
            class="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
            @click="removeArrayItem(Number(idx))"
          />

          <ToolParameterEditor
            :model-value="item"
            :schema="schema?.items"
            @update:model-value="updateArrayItem(Number(idx), $event)"
          />
        </div>
        <UButton
          size="xs"
          variant="soft"
          icon="i-lucide-plus"
          @click="addArrayItem"
        >
          Add Item
        </UButton>
      </div>
    </template>

    <template v-else-if="isObject">
      <div class="space-y-3 border-l-2 border-gray-200 dark:border-gray-800 pl-3 ml-1 mt-1">
        <div
          v-for="(val, key) in modelValue"
          :key="key"
          class="flex flex-col gap-1"
        >
          <div class="flex items-center justify-between">
            <label class="text-[10px] font-bold text-gray-500 uppercase">{{ key }}</label>
            <UButton
              icon="i-lucide-trash"
              size="xs"
              color="neutral"
              variant="ghost"
              @click="removeObjectKey(key as string)"
            />
          </div>
          <ToolParameterEditor
            :model-value="val"
            :schema="schema?.properties?.[key]"
            :name="key as string"
            @update:model-value="updateObjectKey(key as string, $event)"
          />
        </div>
        <UButton
          size="xs"
          variant="ghost"
          icon="i-lucide-plus"
          @click="addObjectKey"
        >
          Add Property
        </UButton>
      </div>
    </template>

    <template v-else>
      <!-- Support for Enum -->
      <div v-if="schema?.enum">
        <USelect
          :model-value="modelValue"
          :items="schema.enum"
          size="sm"
          class="w-full"
          @update:model-value="updateValue"
        />
      </div>

      <div
        v-else-if="schema?.type === 'boolean'"
        class="flex items-center h-8"
      >
        <UCheckbox
          :model-value="modelValue === true || modelValue === 'true'"
          name="checkbox"
          @update:model-value="updateValue"
        />
      </div>
      <UInput
        v-else-if="schema?.type === 'number' || schema?.type === 'integer'"
        type="number"
        :model-value="modelValue"
        size="sm"
        class="font-mono w-full"
        @update:model-value="updateValue"
      />
      <UTextarea
        v-else-if="typeof modelValue === 'string' && modelValue.length > 50"
        :model-value="modelValue"
        size="sm"
        class="font-mono w-full"
        autoresize
        @update:model-value="updateValue"
      />
      <UInput
        v-else
        :model-value="modelValue"
        size="sm"
        class="font-mono w-full"
        @update:model-value="updateValue"
      />
    </template>
  </div>
</template>
