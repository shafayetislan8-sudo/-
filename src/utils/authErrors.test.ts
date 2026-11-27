import assert from 'node:assert/strict';
import { mapFirebaseAuthError, validateEmailPasswordForm } from './authErrors';

// 1. Validation tests (Bengali)
const emptyEmail = validateEmailPasswordForm({
  mode: 'login',
  email: '',
  password: 'secret',
  lang: 'bn',
});
assert.equal(emptyEmail.valid, false);
if (!emptyEmail.valid) assert.ok(emptyEmail.message.includes('ইমেইল'));

const badEmail = validateEmailPasswordForm({
  mode: 'login',
  email: 'invalid-email',
  password: 'secret',
  lang: 'bn',
});
assert.equal(badEmail.valid, false);
if (!badEmail.valid) assert.ok(badEmail.message.includes('সঠিক'));

const shortPass = validateEmailPasswordForm({
  mode: 'register',
  fullName: 'রাফি আহমেদ',
  email: 'rafi@example.com',
  password: '123',
  lang: 'bn',
});
assert.equal(shortPass.valid, false);
if (!shortPass.valid) assert.ok(shortPass.message.includes('৬'));

const shortName = validateEmailPasswordForm({
  mode: 'register',
  fullName: 'A',
  email: 'rafi@example.com',
  password: 'password123',
  lang: 'bn',
});
assert.equal(shortName.valid, false);

const validReg = validateEmailPasswordForm({
  mode: 'register',
  fullName: 'রাফি আহমেদ',
  email: 'rafi@example.com',
  password: 'password123',
  lang: 'bn',
});
assert.equal(validReg.valid, true);

const validForgot = validateEmailPasswordForm({
  mode: 'forgot',
  email: 'rafi@example.com',
  lang: 'bn',
});
assert.equal(validForgot.valid, true);

// 2. Firebase Auth error mapping tests
const disabledErr = mapFirebaseAuthError(
  { code: 'auth/operation-not-allowed', message: 'PASSWORD_LOGIN_DISABLED' },
  'bn',
  undefined,
  'gen-lang-client-0047498127'
);
assert.equal(disabledErr.kind, 'providerNotice');
assert.ok(disabledErr.text.includes('gen-lang-client-0047498127'));
assert.ok(disabledErr.text.includes('Sign-in method'));

const wrongPassErr = mapFirebaseAuthError({ code: 'auth/invalid-credential' }, 'bn');
assert.equal(wrongPassErr.kind, 'error');
assert.ok(wrongPassErr.text.includes('ইমেইল বা পাসওয়ার্ড সঠিক নয়'));

const domainErr = mapFirebaseAuthError(
  { code: 'auth/unauthorized-domain' },
  'bn',
  'ais-dev-7vhhyttk546a3lx6f4vvkv-980683167090.asia-east1.run.app'
);
assert.equal(domainErr.kind, 'error');
assert.ok(domainErr.text.includes('ais-dev-7vhhyttk546a3lx6f4vvkv-980683167090.asia-east1.run.app'));
assert.ok(domainErr.text.includes('Authorized domains'));

const popupErr = mapFirebaseAuthError({ code: 'auth/popup-blocked' }, 'bn');
assert.equal(popupErr.kind, 'error');
assert.ok(popupErr.text.includes('পপ-আপ'));

console.log('All authErrors validation and Bengali mapping tests passed!');
