import express from 'express';
import dotenv from 'dotenv';
dotenv.config();
import dbConfig from "./config/dbConfig";
import engineRouter from "./routes/engineRoute";
import cors from 'cors';
dbConfig().then(() => console.log("✅ Database Connected"));

const app = express();
const PORT = 9000;

app.use(express.json());
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));
app.get('/', (req, res) => {
  res.send('Welcome to NeuraMCP');
});
app.use('/api', engineRouter);

app.listen(PORT, () => {
  console.log(`🚀 Express API running at http://localhost:${PORT}`);
});