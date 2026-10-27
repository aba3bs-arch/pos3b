import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
try {
await db.exec(`
create role anon; create role authenticated;
create table ruta_cxc_movimientos (
 id uuid primary key default gen_random_uuid(), cliente_tipo text not null,cliente_id text not null,
 cliente_nombre text,tipo text not null,monto numeric(12,2) not null check(monto>0),saldo_despues numeric default 0,
 venta_id text,carga_id text,metodo_pago text,notas text,usuario_nombre text,created_at timestamptz default now(),
 estatus text default 'pendiente',pagado_por text,pagado_at timestamptz,gasto_id uuid,folio_venta text);
create table repartidores(id text primary key,nombre text,activo boolean default true);
create table ruta_cargas(id uuid primary key,vendedor_id text);
create table ruta_ventas(id uuid primary key,estado_credito text,transito_id text,folio text,cliente_id text,created_at timestamptz default now(),metodo_pago text,total numeric,articulos jsonb default '[]');
create table cortes_contabilidad_gastos(id uuid primary key default gen_random_uuid(),sucursal_id text,modulo text,
 categoria text,subcategoria text,comentario text,monto numeric check(monto>0),usuario_nombre text,cerrado boolean);
create table transito_efectivo(id uuid primary key default gen_random_uuid(),sucursal_origen text,
 repartidor_id text references repartidores(id),cajero_nombre text,monto numeric check(monto>0),num_traspaso varchar(50),foto_url text,
 estatus text,tipo_movimiento text,descripcion_gasto text,fecha_hora timestamptz,usuario_liquida text);
insert into repartidores values('rep_luis','Luis',true);
`);
const migration=await readFile(new URL('../../supabase/fix_ruta_cxc_pagos_atomicos.sql',import.meta.url),'utf8');
await db.exec(migration);
await db.exec(migration); // reejecución segura
const scalar=async sql=>(await db.query(sql)).rows[0].n;
const cargo=async (monto=100,extra={})=>{
 const id=crypto.randomUUID(),venta=crypto.randomUUID();
 await db.query('insert into ruta_ventas(id,estado_credito) values($1,\'pendiente\')',[venta]);
 await db.query(`insert into ruta_cxc_movimientos(id,cliente_tipo,cliente_id,tipo,monto,venta_id,usuario_nombre,carga_id)
 values($1,'sucursal',$2,'cargo',$3,$4,$5,$6)`,[id,extra.sucursal||'Fusión',monto,extra.venta??venta,extra.vendedor||'Luis',extra.carga||null]);
 return id;
};
const pagar=async (ids,monto,request=crypto.randomUUID(),sucursal='FUSION')=>{
 const r=await db.query('select pagar_creditos_ruta_atomico($1,$2::uuid[],$3,$4,$5) n',[request,ids,monto,sucursal,'Cajera']);
 return r.rows[0].n;
};
const id=await cargo();
await assert.rejects(()=>db.query(`insert into ruta_cxc_movimientos(cliente_tipo,cliente_id,tipo,monto,venta_id)
 select cliente_tipo,cliente_id,tipo,monto,venta_id from ruta_cxc_movimientos where id=$1`,[id]),/Ya existe el cargo/);
const req=crypto.randomUUID();
const r=await pagar([id],30,req);
assert.equal(r.montoPagado,30);
assert.equal(r.parcial,true);
assert.equal(await scalar(`select monto n from ruta_cxc_movimientos where id='${id}'`),'70.00');
assert.deepEqual(await pagar([id],30,req),r);
assert.equal(await scalar('select count(*)::int n from cortes_contabilidad_gastos'),1);
await assert.rejects(()=>pagar([id],40,req),/Solicitud reutilizada/);
await pagar([id],70);
await assert.rejects(()=>pagar([id],70),/ya fue pagado/);
assert.equal(await scalar('select count(*)::int n from cortes_contabilidad_gastos'),2);
assert.equal(await scalar(`select estado_credito n from ruta_ventas where id::text=(select venta_id from ruta_cxc_movimientos where id='${id}')`),'pagado');
// Falla después de crear gasto/tránsito: ninguna escritura del lote sobrevive.
const broken=await cargo(50,{venta:crypto.randomUUID()});
const before=await scalar('select count(*)::int n from cortes_contabilidad_gastos');
await assert.rejects(()=>pagar([broken],50),/venta vinculada/);
assert.equal(await scalar('select count(*)::int n from cortes_contabilidad_gastos'),before);
assert.equal(await scalar(`select estatus n from ruta_cxc_movimientos where id='${broken}'`),'pendiente');
// Todo el lote se revierte, incluido un primer crédito válido.
const good=await cargo(50);
await assert.rejects(()=>pagar([good,broken],100),/venta vinculada/);
assert.equal(await scalar('select count(*)::int n from cortes_contabilidad_gastos'),before);
assert.equal(await scalar(`select estatus n from ruta_cxc_movimientos where id='${good}'`),'pendiente');
const other=await cargo(50,{sucursal:'3B10'});
await assert.rejects(()=>pagar([other],50),/sucursal seleccionada/);
const noRep=await cargo(50,{vendedor:'Desconocido'});
await assert.rejects(()=>pagar([noRep],50),/recolector válido/);
// Parcial de Recolecciones: la ficha conserva solo el saldo pendiente.
const tid=crypto.randomUUID();
await db.query(`insert into transito_efectivo(id,sucursal_origen,repartidor_id,cajero_nombre,monto,estatus,tipo_movimiento)
 values($1,'Fusión','rep_luis','Cajera',100,'Por Cobrar','Entrega Crédito')`,[tid]);
const rec=await cargo(100,{carga:`rec:${tid}`});
await pagar([rec],30);
assert.equal(await scalar(`select monto n from transito_efectivo where id='${tid}'`),'70.00');
await pagar([rec],70);
assert.equal(await scalar(`select tipo_movimiento n from transito_efectivo where id='${tid}'`),'Cobro Crédito');
assert.equal(await scalar(`select sum(monto) n from ruta_cxc_movimientos where cargo_id='${rec}'`),'100.00');
// El error al insertar el abono revierte también el cambio de cargo y el tránsito.
await db.exec(`create function rechazar_abono_prueba() returns trigger language plpgsql as $$
 begin if NEW.tipo='abono' then raise exception 'Abono rechazado'; end if; return NEW; end $$;
 create trigger rechazar_abono_prueba before insert on ruta_cxc_movimientos for each row execute function rechazar_abono_prueba();`);
const failAbono=await cargo(20);
const countBefore=await scalar('select count(*)::int n from cortes_contabilidad_gastos');
await assert.rejects(()=>pagar([failAbono],20),/Abono rechazado/);
assert.equal(await scalar('select count(*)::int n from cortes_contabilidad_gastos'),countBefore);
assert.equal(await scalar(`select estatus n from ruta_cxc_movimientos where id='${failAbono}'`),'pendiente');
await db.exec('drop trigger rechazar_abono_prueba on ruta_cxc_movimientos;');
// SECURITY INVOKER: los permisos efectivos del POS se conservan.
await db.exec('grant usage on schema public to anon; grant select,insert,update on all tables in schema public to anon; revoke insert on transito_efectivo from anon; set role anon;');
await assert.rejects(()=>pagar([failAbono],20),/permission denied/);
await db.exec('reset role;');
assert.equal(await scalar('select count(*)::int n from cortes_contabilidad_gastos'),countBefore);
await db.exec('grant insert on transito_efectivo to anon; set role anon;');
assert.equal((await pagar([failAbono],20)).ok,true);
await db.exec('reset role;');
await db.exec(await readFile(new URL('../../supabase/auditoria_ruta_cxc.sql',import.meta.url),'utf8'));

// Base vacía: el script crea CxC, tránsito, gastos y ventas, y cobra FUSION igual que 3B5.
const limpio = new PGlite();
await limpio.exec(`create role anon; create role authenticated;`);
await limpio.exec(migration);
for (const tabla of ['ruta_cxc_movimientos', 'ruta_cxc_pagos_solicitudes', 'transito_efectivo', 'repartidores', 'cortes_contabilidad_gastos', 'ruta_cargas', 'ruta_ventas']) {
  assert.equal((await limpio.query(`select to_regclass('public.${tabla}')::text n`)).rows[0].n, tabla);
}
await limpio.query(`insert into repartidores(id,nombre) values('rep_luis','Luis')`);
await limpio.query(`insert into transito_efectivo(sucursal_origen,repartidor_id,cajero_nombre,monto,estatus,tipo_movimiento)
 values('Fusión','rep_luis','Cajera',40,'Por Cobrar','Entrega Crédito')`);
await limpio.exec(migration);
assert.equal((await limpio.query(`select sucursal_origen n from transito_efectivo`)).rows[0].n, 'FUSION');
const ventaFusion = crypto.randomUUID();
const venta3b = crypto.randomUUID();
await limpio.query(`insert into ruta_ventas(id,estado_credito) values($1,'pendiente'),($2,'pendiente')`, [ventaFusion, venta3b]);
await limpio.query(`insert into ruta_cxc_movimientos(cliente_tipo,cliente_id,tipo,monto,venta_id,usuario_nombre)
 values('sucursal','Fusión','cargo',40,$1,'Luis'),('sucursal','3B5','cargo',15,$2,'Luis')`, [ventaFusion, venta3b]);
await limpio.exec(migration);
assert.equal((await limpio.query(`select cliente_id n from ruta_cxc_movimientos where venta_id=$1`, [ventaFusion])).rows[0].n, 'FUSION');
assert.equal((await limpio.query(`select cliente_id n from ruta_cxc_movimientos where venta_id=$1`, [venta3b])).rows[0].n, '3B5');
const idFusion = (await limpio.query(`select id n from ruta_cxc_movimientos where venta_id=$1`, [ventaFusion])).rows[0].n;
const id3b = (await limpio.query(`select id n from ruta_cxc_movimientos where venta_id=$1`, [venta3b])).rows[0].n;
const pagoFusion = (await limpio.query('select pagar_creditos_ruta_atomico($1,$2::uuid[],$3,$4,$5) n', [crypto.randomUUID(), [idFusion], 40, 'FUSION', 'Cajera'])).rows[0].n;
const pago3b = (await limpio.query('select pagar_creditos_ruta_atomico($1,$2::uuid[],$3,$4,$5) n', [crypto.randomUUID(), [id3b], 15, '3B5', 'Cajera'])).rows[0].n;
assert.equal(pagoFusion.ok, true);
assert.equal(pagoFusion.montoPagado, 40);
assert.equal(pago3b.ok, true);
assert.equal(pago3b.montoPagado, 15);
assert.equal((await limpio.query(`select sucursal_id n from cortes_contabilidad_gastos where monto=40`)).rows[0].n, 'FUSION');
assert.equal((await limpio.query(`select sucursal_id n from cortes_contabilidad_gastos where monto=15`)).rows[0].n, '3B5');
await limpio.close();
// Sin roles anon/authenticated: el SQL corto deja las 3 tablas y las lista.
const soloTablas = new PGlite();
const tablasSql = await readFile(new URL('../../supabase/fix_tabla_creditos.sql', import.meta.url), 'utf8');
await soloTablas.exec(tablasSql);
const listadas = (await soloTablas.query(`
select c.relname as tabla
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and c.relname in ('transito_efectivo', 'ruta_cxc_movimientos', 'ruta_cxc_pagos_solicitudes')
order by c.relname`)).rows.map((r) => r.tabla);
assert.deepEqual(listadas, ['ruta_cxc_movimientos', 'ruta_cxc_pagos_solicitudes', 'transito_efectivo']);
await soloTablas.exec(tablasSql);
await soloTablas.close();
console.log('rutaCxc SQL: transacción, reintentos, lotes, parciales y sucursales OK');
} finally { await db.close(); }
