const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// --- ESTO QUITA EL ERROR "CANNOT GET /" ---
app.get('/', (req, res) => {
    res.send('<h1>Servidor Abarrotes Las 3B</h1><p>El sistema central está activo y esperando conexiones de las sucursales.</p>');
});

// Lista de tus sucursales actuales
let sucursales = [
    { id: '3B2', nombre: 'Sucursal 3B2' },
    { id: '3B3', nombre: 'Sucursal 3B3' },
    { id: '3B5', nombre: 'Sucursal 3B5' },
    { id: '3B6', nombre: 'Sucursal 3B6' },
    { id: '3B7', nombre: 'Sucursal 3B7' },
    { id: '3B9', nombre: 'Sucursal 3B9' },
    { id: '3B10', nombre: 'Sucursal 3B10' },
    { id: 'FUSION', nombre: 'Sucursal Fusion' }
];

let ventasRealizadas = [];

// Ruta para ver las ventas desde el navegador
app.get('/api/dashboard', (req, res) => {
    res.json(ventasRealizadas);
});

// Ruta para ver las sucursales
app.get('/api/sucursales', (req, res) => {
    res.json(sucursales);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor activo en puerto ${PORT}`);
});
