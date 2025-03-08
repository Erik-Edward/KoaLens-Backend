// src/simpleServer.ts
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Enkel testroute
app.get('/', (_req, res) => {  // Lägg till underscore för oanvänd variabel
  res.json({
    status: 'ok',
    message: 'KoaLens API is running',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// Dummy route för usage
app.get('/usage/:userId', (req, res) => {
  const { userId: _userId } = req.params;  // Lägg till underscore alias för oanvänd variabel
  res.json({
    analysesUsed: 0,
    analysesLimit: 2,
    remaining: 2,
    isPremium: false
  });
});

// Dummy analyze route
app.post('/analyze', (_req, res) => {  // Lägg till underscore för oanvänd variabel
  // Returnera dummy-svar
  res.json({
    isVegan: true,
    confidence: 0.95,
    allIngredients: ["socker", "vatten", "salt", "kryddor"],
    nonVeganIngredients: [],
    reasoning: "Alla ingredienser är veganska."
  });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});