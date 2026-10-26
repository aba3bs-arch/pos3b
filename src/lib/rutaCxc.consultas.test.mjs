import assert from 'node:assert/strict';
import { listarCreditosPendientesRuta, listarCreditosCobradosRuta, saldosCxcPorCliente, registrarCargoCreditoRuta, pagarCreditosRutaConPin, restaurarCreditosRecoleccionACxc } from './rutaCxc.js';

// Emula también un servidor cuyo máximo por respuesta es menor que la página solicitada.
function mock(rows, cap = 137) {
  return { from() {
    const filtros=[];
    const q={ select(){return q}, order(){return q}, eq(k,v){filtros.push(r=>r[k]===v);return q},
      async range(a,b){const data=rows.filter(r=>filtros.every(f=>f(r)));return {data:data.slice(a,Math.min(b+1,a+cap))}} };
    return q;
  }};
}
const base={tipo:'cargo',cliente_tipo:'sucursal',estatus:'pendiente',monto:100};
const rows=Array.from({length:1700},(_,i)=>({...base,id:String(i),cliente_id:'3B2'}));
rows.push({...base,id:'antiguo',cliente_id:'El Mezquite'});
let r=await listarCreditosPendientesRuta(mock(rows),{sucursalId:'3B10',limit:1});
assert.equal(r.data[0].id,'antiguo');
r=await listarCreditosPendientesRuta(mock(rows),{todos:true,limit:1});
assert.equal(r.data.length,1701);
const pagos=[
  {...base,id:'c1',cliente_id:'Fusión',estatus:'pagado',monto:70,venta_id:'v1'},
  {...base,id:'a1',tipo:'abono',cliente_id:'FUSION',monto:30,venta_id:'v1',cargo_id:'c1'},
  {...base,id:'a2',tipo:'abono',cliente_id:'FUSION',monto:70,venta_id:'v1',cargo_id:'c1'},
  {...base,id:'c2',cliente_id:'FUSION',monto:70,venta_id:'v2'},
  {...base,id:'a3',tipo:'abono',cliente_id:'Fusión',monto:30,venta_id:'v2',cargo_id:'c2'},
];
r=await listarCreditosCobradosRuta(mock(pagos),{sucursalId:'FUSION'});
assert.deepEqual(r.data.map(m=>m.id).sort(),['a1','a2','a3']);
r=await saldosCxcPorCliente(mock(pagos));
assert.equal(r.data.length,1);
assert.equal(r.data[0].saldo,70);
assert.equal(r.data[0].abonos,130);
assert.equal(r.data[0].cargos,200);
const missing={from(){return {select(){return this},order(){return this},range:async()=>({error:{code:'42P01',message:'missing table'}})}}};
r=await registrarCargoCreditoRuta(missing,{clienteId:'3B10',monto:30});
assert.equal(r.ok,false);
assert.match(r.error,/Falta la tabla/);
r=await registrarCargoCreditoRuta(null,{clienteId:'3B10',monto:30});
assert.equal(r.ok,false);
// Dos intentos de crear el mismo cargo recuperan el registro confirmado.
const existente={...base,id:'cargo-unico',cliente_id:'3B10',venta_id:'venta-unica'};
const concurrente={from(){const q={select(){return q},order(){return q},eq(){return q},limit(){return q},
 async range(a,b){return {data:[existente].slice(a,b+1)}},
 insert(){return {select(){return {single:async()=>({error:{code:'23505',message:'Duplicado'}})}}}},
 async maybeSingle(){return {data:existente}}};return q}};
r=await registrarCargoCreditoRuta(concurrente,{clienteId:'El Mezquite',monto:100,ventaId:'venta-unica'});
assert.equal(r.ok,true);
assert.equal(r.yaExistia,true);
assert.equal(r.data.id,'cargo-unico');
const request='11111111-1111-4111-8111-111111111111';
let sent;
r=await pagarCreditosRutaConPin({async rpc(name,args){sent={name,args};return {error:{code:'PGRST202'}}}},
 {movimientoIds:['c1'],sucursal:'Fusión',cajeroUser:{nombre:'Cajera'},montoPagar:30,solicitudId:request});
assert.equal(r.ok,false);
assert.match(r.error,/activar los pagos seguros/);
assert.equal(sent.args.p_solicitud,request);
assert.equal(sent.args.p_sucursal,'FUSION');
assert.equal(sent.name,'pagar_creditos_ruta_atomico');
r=await pagarCreditosRutaConPin({async rpc(){throw new Error('offline')}},
 {movimientoIds:['c1'],sucursal:'FUSION',cajeroUser:{nombre:'Cajera'},solicitudId:request});
assert.equal(r.ok,false);
assert.match(r.error,/sin duplicar/);
// Una lectura fallida del índice no se trata como un índice vacío.
let escrituras=0;
r=await restaurarCreditosRecoleccionACxc({from(table){return {
  select(){return this},eq(){return this},order(){return this},
  async range(){return table==='transito_efectivo'?{data:[]}:{error:{message:'No autorizado'}}},
  insert(){escrituras++;throw new Error('No debe escribir')},
}}});
assert.equal(r.ok,false);
assert.equal(escrituras,0);
console.log('rutaCxc consultas: paginación, alias, parciales y errores OK');
