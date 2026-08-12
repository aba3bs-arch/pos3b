-- Préstamos entre áreas: saldo / abono para abonar y liquidar
alter table public.prestamos_interarea add column if not exists saldo numeric(12,2);
alter table public.prestamos_interarea add column if not exists abono numeric(12,2) default 0;

update public.prestamos_interarea
set saldo = coalesce(saldo, monto),
    abono = coalesce(abono, 0)
where saldo is null;

-- RIF: saldo opcional para abonos parciales
alter table public.rifs add column if not exists saldo numeric(12,2);

update public.rifs
set saldo = coalesce(saldo, monto)
where estado = 'abierto' and saldo is null;
