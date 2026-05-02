const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js'); // Nueva librería
const app = express();

app.use(cors());
app.use(express.json());

// CONFIGURACIÓN DE SUPABASE
// Reemplaza esto con tus datos de Supabase
const supabaseUrl = 'TU_URL_DE_SUPABASE';
const supabaseKey = 'TU_LLAVE_SERVICE_ROLE';
const supabase = createClient(supabaseUrl, supabaseKey);

app.get('/', (req, res) => {
    res.send('<h1>Servidor Abarrotes Las 3B</h1><p>Conectado a Base de Datos Nube.</p>');
});

// RUTA PARA REGISTRAR VENTA (Ahora guarda en Supabase)
app.post('/api/vender', async (req, res) => {
    const { sucursal_id, total, productos } = req.body;

    const { data, error } = await supabase
        .from('ventas')
        .insert([
            { sucursal_id, total, detalles: JSON.stringify(productos) }
        ]);

    if (error) return res.status(500).json(error);
    res.status(201).json({ mensaje: "Venta guardada permanentemente", data });
});

// RUTA PARA EL DASHBOARD (Lee de Supabase)
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
