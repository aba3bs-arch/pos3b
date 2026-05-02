const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Datos simulados (En el futuro esto vendrá de SQL)
let ventasRealizadas = [
    { id: 1, sucursal: 'Sucursal Norte', total: 1500, fecha: '2026-05-01' },
    { id: 2, sucursal: 'Sucursal Centro', total: 2300, fecha: '2026-05-01' }
];

// RUTA PARA EL PANEL: Obtener resumen de ventas
app.get('/api/dashboard', (req, res) => {
    res.json(ventasRealizadas);
});

// RUTA PARA EL POS: Registrar una nueva venta
app.post('/api/vender', (req, res) => {
    const nuevaVenta = {
        id: ventasRealizadas.length + 1,
        ...req.body,
        fecha: new Date().toISOString()
    };
    ventasRealizadas.push(nuevaVenta);
    console.log("Venta registrada:", nuevaVenta);
    res.status(201).json({ mensaje: "Venta guardada con éxito", venta: nuevaVenta });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
