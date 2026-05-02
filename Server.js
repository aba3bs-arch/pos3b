const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Esto es lo que verás al entrar a la URL de Render
app.get('/', (req, res) => {
    res.send('Servidor de Abarrotes Las 3B operando correctamente.');
});

// Datos de prueba para tu panel
let ventasRealizadas = [
    { id: 1, sucursal: 'Sucursal Norte', total: 1500, fecha: new Date().toISOString() }
];

app.get('/api/dashboard', (req, res) => {
    res.json(ventasRealizadas);
});

app.post('/api/vender', (req, res) => {
    const nuevaVenta = { id: ventasRealizadas.length + 1, ...req.body, fecha: new Date().toISOString() };
    ventasRealizadas.push(nuevaVenta);
    res.status(201).json({ mensaje: "Venta guardada", venta: nuevaVenta });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
