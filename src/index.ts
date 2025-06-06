import path from 'path';
import { app } from './server';
import { getHorarios, proxyPort, startProxyServer } from './browser';

async function main(): Promise<void> {
  const horariosMaterias = await getHorarios(process.env.USER ?? '', process.env.PASSWORD ?? '');

  //console.log('datos:\n', JSON.stringify(tablaDatos, null, '  '));
  console.log('datos:\n', JSON.stringify(horariosMaterias, null, '  '));

  const json = Bun.file(path.join(__dirname, '..', 'horarios.json'));
  Bun.write(json, JSON.stringify(horariosMaterias, null, '  '));
};

const port = process.env.PORT ?? 8000;

await startProxyServer(proxyPort);
app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
//await main();
//console.log('finished');
//process.exit(0);