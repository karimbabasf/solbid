import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './kit/tokens.css';
import Stage from './stage/Stage';
import Phone from './phone/Phone';
import Banner from './banner/Banner';

const isPhone = location.pathname.startsWith('/play');
const isBanner = location.pathname.startsWith('/banner');

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isBanner ? <Banner /> : isPhone ? <Phone /> : <Stage />}</StrictMode>,
);
