import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { SharedDataProvider } from './contexts/SharedDataProvider';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <SharedDataProvider>
          <App />
          <Toaster
            position="top-right"
            toastOptions={{
              className: 'toast-custom',
              duration: 4000,
            }}
          />
        </SharedDataProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
