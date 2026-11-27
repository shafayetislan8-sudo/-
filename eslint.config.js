import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: ['dist/**/*', 'node_modules/**/*', 'android/**/*', 'functions/lib/**/*'],
  },
  firebaseRulesPlugin.configs['flat/recommended'],
];
