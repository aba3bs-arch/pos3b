const AdminSucursales = () => {
  const [nuevoId, setNuevoId] = useState('');
  const [nuevoNombre, setNuevoNombre] = useState('');

  const crearSucursal = async () => {
    const respuesta = await fetch('https://tu-app.onrender.com/api/sucursales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: nuevoId, nombre: nuevoNombre })
    });

    if (respuesta.ok) {
      alert("Nueva sucursal añadida a la red Las 3B");
      setNuevoId('');
      setNuevoNombre('');
    }
  };

  return (
    <div style={{ padding: '20px', border: '1px solid #ccc', borderRadius: '10px' }}>
      <h3>Registrar Nueva Sucursal</h3>
      <input 
        placeholder="ID (ej: 3B11)" 
        value={nuevoId} 
        onChange={(e) => setNuevoId(e.target.value)} 
        style={estiloInput}
      />
      <input 
        placeholder="Nombre (ej: Sucursal Nueva)" 
        value={nuevoNombre} 
        onChange={(e) => setNuevoNombre(e.target.value)} 
        style={estiloInput}
      />
      <button onClick={crearSucursal} style={estiloBoton}>Guardar Sucursal</button>
    </div>
  );
};

const estiloInput = { padding: '10px', margin: '5px', borderRadius: '5px', border: '1px solid #ddd' };
const estiloBoton = { padding: '10px 20px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' };
