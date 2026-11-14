import '@fontsource-variable/fraunces/wght.css';
import '@fontsource-variable/fraunces/wght-italic.css';
import './styles.css';
import { render } from 'preact';
import { App } from './app';

render(<App />, document.getElementById('app')!);
