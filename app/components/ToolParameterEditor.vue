<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  modelValue: any
  schema?: any
  name?: string
}>()

const emit = defineEmits(['update:modelValue'])

const isArray = computed(() => Array.isArray(props.modelValue))
const isObject = computed(() => typeof props.modelValue === 'object' && props.modelValue !== null && !isArray.value)

const updateValue = (val: any) => {
  emit('update:modelValue', val)
}

const updateArrayItem = (index: number, val: any) => {
  const newArray = [...props.modelValue]
  newArray[index] = val
  updateValue(newArray)
}

const addArrayItem = () => {
  const newArray = [...(props.modelValue || [])]
  const itemSchema = props.schema?.items || {}

  let newItem: any = ''
  if (itemSchema.type === 'object') {
    newItem = {}
    if (itemSchema.properties) {
      Object.keys(itemSchema.properties).forEach((k) => {
        newItem[k] = itemSchema.properties[k].type === 'array' ? [] : (itemSchema.properties[k].type === 'object' ? {} : '')
      })
    }
  } else if (itemSchema.type === 'array') {
    newItem = []
  }

  // Specific fallback for ask_user if schema is missing properties
  if (props.name === 'questions' && !itemSchema.properties) {
    newItem = { question: 'New question?', header: 'Info', type: 'text' }
  }

  newArray.push(newItem)
  updateValue(newArray)
}

const removeArrayItem = (index: number) => {
  const newArray = [...props.modelValue]
  newArray.splice(index, 1)
  updateValue(newArray)
}

const updateObjectKey = (key: string, val: any) => {
  const newObj = { ...props.modelValue, [key]: val }
  updateValue(newObj)
}

const addObjectKey = () => {
  const key = window.prompt('Enter new property name:')
  if (key && !props.modelValue[key]) {
    updateObjectKey(key, '')
  }
}

const removeObjectKey = (key: string) => {
  const newObj = { ...props.modelValue }
  delete newObj[key]
  updateValue(newObj)
}
</script>

<template>
  <div class="w-full">
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
      <div
        v-if="schema?.type === 'boolean'"
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
