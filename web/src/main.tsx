import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './kit/tokens.css';
import Stage from './stage/Stage';
import Phone from './phone/Phone';
import Banner from './banner/Banner';
import Thumb from './banner/Thumb';

const isPhone = location.pathname.startsWith('/play');
const isBanner = location.pathname.startsWith('/banner');
const isThumb = location.pathname.startsWith('/thumb');

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isThumb ? <Thumb /> : isBanner ? <Banner /> : isPhone ? <Phone /> : <Stage />}</StrictMode>,
);
