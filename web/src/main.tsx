import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './kit/tokens.css';
import Stage from './stage/Stage';
import Phone from './phone/Phone';

const isPhone = location.pathname.startsWith('/play');

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isPhone ? <Phone /> : <Stage />}</StrictMode>,
);
