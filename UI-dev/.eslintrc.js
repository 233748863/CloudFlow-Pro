module.exports = {
  root: true,
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  parser: 'vue-eslint-parser',
  parserOptions: {
    ecmaVersion: 12,
    parser: '@typescript-eslint/parser',
    sourceType: 'module',
  },
  extends: ['plugin:vue/vue3-essential', 'plugin:vue/essential', 'eslint:recommended'],
  plugins: ['vue', '@typescript-eslint', 'prettier'],
  overrides: [
    {
      files: ['*.ts', '*.tsx', '*.vue'],
      rules: {
        'no-undef': 'off',
      },
    },
  ],
  rules: {
    // 'prettier/prettier': 'error',
    // http://eslint.cn/docs/rules/
    // https://eslint.vuejs.org/rules/
    // https://typescript-eslint.io/rules/no-unused-vars/
    '@typescript-eslint/ban-ts-ignore': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-var-requires': 'off',
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/no-use-before-define': 'off',
    '@typescript-eslint/ban-ts-comment': 'off',
    '@typescript-eslint/ban-types': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-redeclare': 'error',
    '@typescript-eslint/no-non-null-asserted-optional-chain': 'off',
    '@typescript-eslint/no-unused-vars': [2],
    'vue/custom-event-name-casing': 'off',
    'vue/attributes-order': [
      'error',
      {
        order: [
          'DEFINITION',
          'LIST_RENDERING',
          'CONDITIONALS', // v-if 在前
          'RENDER_MODIFIERS',
          'GLOBAL',
          'UNIQUE',
          'SLOT',
          'TWO_WAY_BINDING',
          'OTHER_DIRECTIVES',
          'ATTR_DYNAMIC', // :closable 等动态属性
          'ATTR_STATIC', // title, type 等静态属性
          // 'OTHER_ATTR',
          'ATTR_SHORTHAND_BOOL',
          'EVENTS', // @click 在后
          'CONTENT',
        ],
        alphabetical: true,
      },
    ],
    'vue/one-component-per-file': 'off',
    'vue/html-closing-bracket-newline': 'off',
    // 'vue/max-attributes-per-line': 'off',
    // 'vue/multiline-html-element-content-newline': 'off',
    // 'vue/singleline-html-element-content-newline': 'off',
    // 'vue/attribute-hyphenation': 'off',
    'vue/html-self-closing': 'off',
    'vue/no-multiple-template-root': 'off',
    'vue/require-default-prop': 'off',
    'vue/no-v-model-argument': 'off',
    'vue/no-arrow-functions-in-watch': 'off',
    'vue/no-template-key': 'off',
    'vue/no-v-html': 'off',
    'vue/comment-directive': 'off',
    'vue/no-mutating-props': 'off',
    'vue/no-parsing-error': 'off',
    'vue/no-deprecated-v-on-native-modifier': 'off',
    'vue/multi-word-component-names': 'off',
    'vue/attribute-hyphenation': ['error', 'always'],
    // 多属性时的换行规则
    'vue/max-attributes-per-line': [
      'error',
      {
        singleline: 5, // 单行最多5个属性
        multiline: 1, // 多行时每个属性一行
      },
    ],
    // 单属性是否换行
    'vue/singleline-html-element-content-newline': 'off',
    'vue/multiline-html-element-content-newline': 'off',
    'no-useless-escape': 'off',
    'no-sparse-arrays': 'off',
    'no-prototype-builtins': 'off',
    'no-constant-condition': 'off',
    'no-use-before-define': 'off',
    'no-restricted-globals': 'off',
    'no-restricted-syntax': 'off',
    'generator-star-spacing': 'off',
    'no-unreachable': 'off',
    'no-multiple-template-root': 'off',
    'no-unused-vars': 'error',
    'no-v-model-argument': 'off',
    'no-case-declarations': 'off',
    'no-console': 'off', // error
    'no-redeclare': 'off',
    'no-mixed-spaces-and-tabs': 'off',
    'vue/mustache-interpolation-spacing': ['error', 'always'],
    // 链式调用换行规则
    'newline-per-chained-call': ['error', { ignoreChainWithDepth: 3 }],
    // 函数调用括号内的换行
    'function-call-argument-newline': ['error', 'consistent'],
    // 函数括号换行
    'function-paren-newline': ['error', 'consistent'],
  },
}
