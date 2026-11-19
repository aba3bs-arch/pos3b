import assert from 'node:assert/strict';
import { esEndpointAndroid, opcionesEnvioPush } from '../../supabase/functions/enviar-push/opcionesPush.js';

const fcm = 'https://fcm.googleapis.com/fcm/send/abc';
const apple = 'https://web.push.apple.com/QK1';

assert.equal(esEndpointAndroid(fcm), true);
assert.equal(esEndpointAndroid('https://android.googleapis.com/gcm/send/x'), true);
assert.equal(esEndpointAndroid(apple), false);

const android = opcionesEnvioPush(fcm, true);
assert.equal(android.urgency, 'high');
assert.equal(android.TTL, 60 * 60 * 6);
assert.equal('topic' in android, false);

const iphone = opcionesEnvioPush(apple, true);
assert.equal(iphone.topic, 'asalto3b');
assert.equal(iphone.urgency, 'high');

const normal = opcionesEnvioPush(fcm, false);
assert.equal(normal.TTL, 60 * 60 * 12);
assert.equal('topic' in normal, false);

console.log('opcionesPushDestino.test.mjs ok');
