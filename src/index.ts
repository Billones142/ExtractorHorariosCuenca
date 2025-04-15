import pupeteer, { ElementHandle } from 'puppeteer';
import { spawn } from 'child_process';
import path from 'path';

async function startProxyServer(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    // Create a simpler proxy server script
    const code = `
      const { Server } = require('proxy-chain');
      const server = new Server({ port: ${port} });
      server.listen(() => {
        console.log('Proxy ready');
      });
    `;

    // Spawn the process with minimal options
    const child = spawn('node', ['-e', code], {
      stdio: 'pipe',
      detached: false,
    });

    // Handle stdout
    child.stdout?.on('data', (data: Buffer) => {
      const output: string = data.toString();
      if (output.includes('Proxy ready')) {
        resolve();
      }
    });

    // Handle stderr
    child.stderr?.on('data', (data: Buffer) => {
    });

    // Handle process exit
    child.on('exit', (code: number | null) => {
      if (code !== 0) {
        reject(new Error(`Proxy exited with code ${code}`));
      }
    });

    // Handle process error
    child.on('error', (err: Error) => {
      reject(err);
    });
  });
}

function removeAccents(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

async function main(): Promise<void> {
  const proxyPort= 8000;
  await startProxyServer(proxyPort);
  const proxyUrl = `http://localhost:${proxyPort}`;
  const browser= await pupeteer.launch({
    browser: 'chrome',
    headless: true,
    args: [`--proxy-server=${proxyUrl}`],
  });

  const page= (await browser.pages())[0];

  await page.goto('https://sistemacuenca.ucp.edu.ar/alumnosnotas/', 
     {waitUntil: 'networkidle2',

     }
  );

  const userInput= await page.$('input[placeholder="Usuario"]');
  const passwordInput= await page.$('input[placeholder="Contraseña"]');

  await userInput?.type(process.env.USER ?? '');
  await passwordInput?.type(process.env.PASSWORD ?? '');

  const ingresarButton= await page.$('input[type="image"]');
  
  await ingresarButton?.click();

  await page.waitForSelector('div[id="ctl00_AccordionPane9_header"]');

  await page.goto('https://sistemacuenca.ucp.edu.ar/alumnosnotas/Proteccion/MateriaHorarioAula.aspx',
    {waitUntil: 'networkidle2'},
  )

  //document.querySelector('table[class="grid"').querySelectorAll('tr[style^="border-color"]')
  const table= await page.$('table[class="grid"');

  const filas= await table?.$$('tr[style^="border-color"]');

  if (!(filas instanceof Array)) {
    console.error('no se encontraron filas');
    return;
  }

  const tablaDatos= Array<{materia: string, horario: string, aula: string}>();

  // Process all rows in parallel and wait for completion
  const rowPromises = filas.map(async (fila) => {
    const columnas = await fila.$$('td');

    const getTextContent = async (element: ElementHandle): Promise<string> => (await element.getProperty('textContent')).toString().split('JSHandle:')[1];

    const materia = await getTextContent(columnas[0]);
    const horario = await getTextContent(columnas[1]);
    const aula = await getTextContent(columnas[2]);

    return {
      aula: aula,
      horario: horario,
      materia: materia,
    };
  });

  // Wait for all promises to resolve and collect the results
  const results = await Promise.all(rowPromises);
  tablaDatos.push(...results);

  type Dia = 'Lunes' | 'Martes' | 'Miercoles' | 'Jueves' | 'Viernes' | 'Sabado';
  interface Horario {
    dia: Dia,
    horario: string,
    aula: string,
  };

  interface Materia {
    nombre: string,
    horarios: Horario[],
  };

  const horariosMaterias: Materia[]= [];

  tablaDatos.forEach((element) => {
    const horarios: Horario[]= [];

    const horarioSeparados= element.horario.split('\n ').filter((ele) => ele.length !== 0);
    const aulasSeparadas= element.aula.split(', ');

    if (horarioSeparados.length !== aulasSeparadas.length) {
      throw Error('horariosSeparados y aulasSeparadas do not have the same length');
    }

    for (let index = 0; index < horarioSeparados.length; index++) {
      const horario = horarioSeparados[index].split(' de ')[1];
      const aula = aulasSeparadas[index].split(' ').slice(1).join(' ');
      const dia = (() => {
        const diaRaw= aulasSeparadas[index].split(' ')[0];
        const diaFormated = removeAccents(diaRaw
          .substring(0,1)
          .toUpperCase()
          + diaRaw
          .toLowerCase()
          .substring(1));
        console.log('Dia:', diaFormated);
        if (['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'].includes(diaFormated)) {
          return diaFormated as Dia;
        } else {
          throw Error('El dia no es valido: '+ diaFormated);
        }
      })();
      
      horarios.push(
        {
          aula: aula,
          dia: dia,
          horario: horario,
        }
      )
    }

    horariosMaterias.push(
      {
        nombre: element.materia.split(' - ')[0], // tomar solo el nombre y no la comision
        horarios: horarios
      }
    )
  })

  //console.log('datos:\n', JSON.stringify(tablaDatos, null, '  '));
  console.log('datos:\n', JSON.stringify(horariosMaterias, null, '  '));

  const json= Bun.file(path.join(__dirname, '..', 'horarios.json'));
  Bun.write(json, JSON.stringify(horariosMaterias, null, '  '));
};

await main();
console.log('finished');
process.exit(0);