const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Lista inicial de tus sucursales
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

// Ruta para obtener la lista de sucursales
app.get('/api/sucursales', (req, res) => {
    res.json(sucursales);
});

// Ruta para CREAR una nueva sucursal
app.post('/api/sucursales', (req, res) => {
    const nuevaSucursal = req.body; // Espera { id: '3B11', nombre: 'Sucursal 3B11' }
    sucursales.push(nuevaSucursal);
    res.status(201).json({ mensaje: "Sucursal creada con éxito", sucursales });
});

// Ruta para registrar ventas (actualizada para usar el ID de sucursal)
app.post('/api/vender', (req, res) => {
    const venta = { 
        ...req.body, 
        id_operacion: Date.now(), 
        fecha: new Date().toISOString() 
    };
    ventasRealizadas.push(venta);
    res.status(201).json({ mensaje: "Venta registrada", venta });
});

app.get('/api/dashboard', (req, res) => {
    res.json(ventasRealizadas);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor Las 3B activo en puerto ${PORT}`);
});
