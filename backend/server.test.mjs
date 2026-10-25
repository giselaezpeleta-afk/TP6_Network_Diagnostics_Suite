import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from './server.mjs';

test('outbox: recepción persistente, reintento idempotente y conflicto sin sobrescritura', async () => {
  const dir = await mkdtemp(join(tmpdir(),'tp6-sync-'));
  const server = createServer(dir);await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const record = {id: 'test-1', kind: 'diagnostic', equipment: 'test', notes: 'SNMP real',createdAt: new Date().toISOString()};
  const post = body => fetch(`${base}/sync`,{method: 'POST',headers: {'Content-Type':'application/json'},body:JSON.stringify(body)});
  try {
    assert.equal((await fetch(`${base}/equipment/router-casa`)).status,200);
    assert.equal((await post({record,attachments: []})).status,201);
    assert.equal((await post({record,attachments: []})).status,200);
    assert.equal((await post({record: {...record,notes:'otro contenido'},attachments: []})).status,409);
    assert.equal((await post({record: {...record,id:'../escape'},attachments: []})).status,400);
    assert.equal((await post({record: {...record,id:'installation',kind:'installation'},attachments: []})).status,400);
    // Fixtures de transporte: no se usan como fotos ni reportes de la demo real.
    const installation = {...record, id: 'fixture-installation', kind: 'installation', site: 'fixture',
      location: {latitude: 0, longitude: 0, accuracy: 1, timestamp: Date.now()},
      photos: ['file:///private/fixture.jpg'], pdf: 'file:///private/fixture.pdf'};
    const attachments = [{name:'fixture.jpg',data:Buffer.from('fixture-photo').toString('base64')},
      {name:'fixture.pdf',data:Buffer.from('fixture-pdf').toString('base64')}];
    assert.equal((await post({record:installation,attachments})).status,201);
    assert.equal((await post({record:installation,attachments})).status,200);
  } finally {await new Promise(resolve => server.close(resolve));await rm(dir,{recursive: true,force:true});}
});
