import './styles.css';
import { startApp } from './ui/app';
import { mountSiteShell } from './ui/site-shell';

const app = document.getElementById('app')!;
mountSiteShell(app);
startApp(app);
