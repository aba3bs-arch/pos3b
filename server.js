const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const app = express();

app.use(cors());
app.use(express.json());

// Verifica que las variables existan antes de iniciar
const supabaseUrl = process.env.SUPABASE_URL || 'https://bablzxlaospziombkpdd.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY; 

if (!supabaseKey) {
    console.error("ERROR: Falta la SUPABASE_KEY en las variables de entorno.");
}

const supabase = createClient(supabaseUrl, supabaseKey);

app.get('/', (req, res) => {
    res.send('Servidor Las 3B Operando');
});

// ... resto de tus rutas ...

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor activo en puerto ${PORT}`);
});
