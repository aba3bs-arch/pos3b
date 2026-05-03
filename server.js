const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const app = express();

app.use(cors());
app.use(express.json());

// CONFIGURACIÓN DE SUPABASE
const supabaseUrl = 'https://bablzxlaospziombkpdd.supabase.co';
// Usa la llave que me pasaste aquí
const supabaseKey = 'TU_LLAVE_ANON_RECIBIDA'; 
const supabase = createClient(supabaseUrl, supabaseKey);

app.get('/', (req, res) => {
    res.send('<h1>Servidor Abarrotes Las 3B</h1><p>Conexión con Base de Datos Establecida.</p>');
});

// Registrar venta en la tabla 'ventas' de Supabase
app.post('/api/vender', async (req, res) => {
    const { sucursal_id, total, detalles } = req.body;
    const { data, error } = await supabase
        .from('ventas')
        .insert([{ sucursal_id, total, detalles }]);

    if (error) return res.status(500).json(error);
    res.status(201).json({ mensaje: "Venta guardada en la nube", data });
});

// Obtener todas las ventas para tu Dashboard
app.get('/api/dashboard', async (req, res) => {
    const { data, error } = await supabase
        .from('ventas')
        .select('*')
        .order('fecha', { ascending: false });

    if (error) return res.status(500).json(error);
    res.json(data);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor activo en puerto ${PORT}`);
});
