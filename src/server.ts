import express, { Request, Response } from 'express';
import assert from 'assert';
import { getHorarios } from './browser';

export const app = express();

app.use(express.urlencoded({ extended: true }));

app.get('/', (req: Request, res: Response) => {
  res.status(200).send('ok');
});

app.get('/json', async (req: Request, res: Response) => {
  try {
    const user = req.query.user;
    const password = req.query.password;

    const horarios = await getHorarios(user as string, password as string);
    console.log('terminada la solicitud de ' + user);
    res.status(200).json(horarios);
  } catch (err) {
    console.error(err);
    if (err instanceof Error) {
      res.status(500).send(`error: ${err.message}`);
    }
  }
});