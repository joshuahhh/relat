import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { Root } from './Root.js'
import './style.css'
import * as Peggy from 'peggy';
import * as lib from '../lib.js';

(window as any).lib = lib;
(window as any).Peggy = Peggy;

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route path="*" element={<Root/>}/>
      </Routes>
    </HashRouter>
  </React.StrictMode>,
);
