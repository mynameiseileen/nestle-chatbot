import React from 'react';
import Chatbot from './components/Chatbot';
import './App.css';

// Handles the background image and layout
// A local screenshot of the Nestlé website is used as the background
function App() {
  return (
    <div className="App">
      <div style={{
        backgroundImage: 'url(/nestle-screenshot.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        height: '100vh',
        width: '100vw',
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: -1
      }} />
      <Chatbot />
    </div>
  );
}

export default App;