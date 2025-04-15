import pupeteer, { ElementHandle } from 'puppeteer';
import { spawn } from 'child_process';
export const proxyPort= 8001;

export type Dia = 'Lunes' | 'Martes' | 'Miercoles' | 'Jueves' | 'Viernes' | 'Sabado';
export interface Horario {
  dia: Dia,
  horario: string,
  aula: string,
};

export interface HorariosMateria {
  nombre: string,
  horarios: Horario[],
};

function removeAccents(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export async function startProxyServer(port: number): Promise<void> {
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

export async function getHorarios(user: string, password: string): Promise<HorariosMateria[]> {
  const proxyUrl = `http://localhost:${proxyPort}`;
  const browser = await pupeteer.launch({
    browser: 'chrome',
    headless: false,
    args: [`--proxy-server=${proxyUrl}`],
  });

  const page = (await browser.pages())[0];

  await page.goto('https://sistemacuenca.ucp.edu.ar/alumnosnotas/',
    {
      waitUntil: 'networkidle2',
    }
  ).catch(() => console.error('Error while waiting'));

  const userInput = await page.$('input[placeholder="Usuario"]');
  const passwordInput = await page.$('input[placeholder="Contraseña"]');

  await userInput?.type(user ?? '');
  await passwordInput?.type(password ?? '');

  const ingresarButton = await page.$('input[type="image"]');

  await ingresarButton?.click();

  await page.waitForSelector('div[id="ctl00_AccordionPane9_header"]').catch(() => console.error('Error while waiting menu'));

  await page.goto('https://sistemacuenca.ucp.edu.ar/alumnosnotas/Proteccion/MateriaHorarioAula.aspx',
    { waitUntil: 'networkidle2' },
  )

  //document.querySelector('table[class="grid"').querySelectorAll('tr[style^="border-color"]')
  const table = await page.$('table[class="grid"');

  const filas = await table?.$$('tr[style^="border-color"]');

  if (!(filas instanceof Array)) {
    throw Error('no se encontraron filas');
  }

  
  const tablaDatos = Array<{ materia: string, horario: string, aula: string }>();
  
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
  
  browser.close();

  const horariosMaterias: HorariosMateria[] = [];
  
  tablaDatos.forEach((element) => {
    const horarios: Horario[] = [];
    
    const horarioSeparados = element.horario.split('\n ').filter((ele) => ele.length !== 0);
    const aulasSeparadas = element.aula.split(', ');
    
    if (horarioSeparados.length !== aulasSeparadas.length) {
      throw Error('horariosSeparados y aulasSeparadas do not have the same length');
    }

    for (let index = 0; index < horarioSeparados.length; index++) {
      const horario = horarioSeparados[index].split(' de ')[1];
      const aula = aulasSeparadas[index].split(' ').slice(1).join(' ');
      const dia = (() => {
        const diaRaw = aulasSeparadas[index].split(' ')[0];
        const diaFormated = removeAccents(diaRaw
          .substring(0, 1)
          .toUpperCase()
          + diaRaw
          .toLowerCase()
          .substring(1));
          if (['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'].includes(diaFormated)) {
            return diaFormated as Dia;
          } else {
            throw Error('El dia no es valido: ' + diaFormated);
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
    
  return horariosMaterias;
}