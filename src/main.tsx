import {startLogImageCache} from './logImageCache';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './fonts.css';
import './style.css';
import './modes.css';
import './appearance.css';
startLogImageCache();
createRoot(document.getElementById('root')!).render(<App />);
