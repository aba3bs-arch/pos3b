const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// CONFIGURACIÓN DE VARIABLES DE ENTORNO
// Estas llaves se configuran en la pestaña 'Environment' de Render
const supabaseUrl = process.env.SUPABASE_URL || 'https://bablzxlaospziombkpdd.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY;

// Inicialización de Supabase
if (!supabaseKey) {
    console.error("CRÍTICO: No se encontró la SUPABASE_KEY en las variables de entorno de Render.");
}
const supabase = createClient(supabaseUrl, supabaseKey);

// --- RUTAS DEL SERVIDOR ---

// 1. Mensaje de bienvenida para verificar que el servidor está LIVE
app.get('/', (req, res) => {
    res.send(`
        <div style="font-family: sans-serif; text-align: center; padding: 50px;">
            <h1 style="color: #27ae60;">🚀 Servidor Abarrotes Las 3B Activo</h1>
            <p>Conexión a la nube establecida correctamente.</p>
            <div style="background: #f4f4f4; padding: 10px; display: inline-block; border-radius: 5px;">
                Estado: 🟢 Operacional
            </div>
        </div>
    `);
});

// 2. Ruta para registrar una venta (Desde las tablets de 3B2, Fusion, etc.)
app.post('/api/vender', async (req, res) => {
    const { sucursal_id, total, detalles } = req.body;

    // Validación básica
    if (!sucursal_id || !total) {
        return res.status(400).json({ error: "Faltan datos obligatorios (sucursal o total)." });
    }

    try {
        const { data, error } = await supabase
            .from('ventas')
            .insert([
                { 
                    sucursal_id: sucursal_id, 
                    total: parseFloat(total), 
                    detalles: detalles // Aquí se guarda la lista de productos cobrados
                }
            ]);

        if (error) throw error;

        res.status(201).json({ mensaje: "Venta guardada en Supabase", data });
    } catch (error) {
        console.error("Error al guardar venta:", error.message);
        res.status(500).json({ error: "No se pudo registrar la venta en la base de datos." });
    }
});

// 3. Ruta para el Dashboard (Para que tú veas las ventas totales)
app.get('/api/dashboard', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('ventas')
            .select('*')
            .order('fecha', { ascending: false });

        if (error) throw error;

        res.json(data);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener datos de ventas." });
    }
});

// 4. Ruta para obtener el catálogo de productos
app.get('/api/productos', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('productos')
            .select('*');
        
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: "Error al cargar el catálogo de productos." });
    }
});

// CONFIGURACIÓN DEL PUERTO
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
    ===========================================
    ✅ SERVIDOR LAS 3B INICIADO CON ÉXITO
    📡 Puerto: ${PORT}
    🏠 URL: https://pos3b.onrender.com
    ===========================================
    `);
});
