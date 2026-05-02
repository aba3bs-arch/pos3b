import React, { useState } from 'react';

const POS = () => {
  const [carrito, setCarrito] = useState([]);
  const [total, setTotal] = useState(0);

  // Lista de productos de prueba (luego vendrán de tu base de datos)
  const productosBase = [
    { id: 1, nombre: 'Aceite 1L', precio: 45 },
    { id: 2, nombre: 'Arroz 1kg', precio: 22 },
    { id: 3, nombre: 'Huevo 12 pz', precio: 38 },
    { id: 4, nombre: 'Leche 1L', precio: 26 }
  ];

  const agregarAlCarrito = (prod) => {
    setCarrito([...carrito, { ...prod, tempId: Date.now() }]);
    setTotal(total + prod.precio);
  };

  const finalizarVenta = async () => {
    if (carrito.length === 0) return alert("El carrito está vacío");

    const venta = {
      sucursal_id: 1, // Aquí puedes cambiar según la tienda
      productos: carrito,
      total: total
    };

    try {
      // REEMPLAZA ESTA URL con la que te dio Render
      const respuesta = await fetch('https://tu-app.onrender.com/api/vender', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(venta)
      });

      if (respuesta.ok) {
        alert("¡Venta guardada en la nube con éxito!");
        setCarrito([]);
        setTotal(0);
      }
    } catch (error) {
      alert("Error al conectar con el servidor");
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'sans-serif' }}>
      {/* Sección de Productos (Izquierda) */}
      <div style={{ flex: 2, padding: '20px', backgroundColor: '#f4f4f4' }}>
        <h2>Abarrotes Las 3B - Ventas</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
          {productosBase.map(prod => (
            <button 
              key={prod.id} 
              onClick={() => agregarAlCarrito(prod)}
              style={estiloBotonProducto}
            >
              <strong>{prod.nombre}</strong><br/>
              ${prod.precio}.00
            </button>
          ))}
        </div>
      </div>

      {/* Sección de Ticket (Derecha) */}
      <div style={{ flex: 1, padding: '20px', borderLeft: '2px solid #ddd', backgroundColor: 'white' }}>
        <h3>Ticket de Venta</h3>
        <div style={{ height: '60%', overflowY: 'auto' }}>
          {carrito.map(item => (
            <div key={item.tempId} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span>{item.nombre}</span>
              <span>${item.precio}</span>
            </div>
          ))}
        </div>
        <hr />
        <h2>Total: ${total}.00</h2>
        <button onClick={finalizarVenta} style={estiloBotonCobrar}>
          COBRAR Y GUARDAR
        </button>
      </div>
    </div>
  );
};

// Estilos rápidos para Tablet
const estiloBotonProducto = {
  padding: '25px',
  fontSize: '18px',
  borderRadius: '10px',
  border: '1px solid #ccc',
  backgroundColor: 'white',
  cursor: 'pointer'
};

const estiloBotonCobrar = {
  width: '100%',
  padding: '20px',
  fontSize: '22px',
  fontWeight: 'bold',
  backgroundColor: '#27ae60',
  color: 'white',
  border: 'none',
  borderRadius: '10px',
  cursor: 'pointer',
  marginTop: '20px'
};

export default POS;
