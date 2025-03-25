// C:\Projects\koalens-backend\src\constants\veganIngredients.ts

// Ingredienser som definitivt INTE är veganska
export const DEFINITELY_NON_VEGAN = new Set([
    // Mejeriprodukter
    'vassle', 'vasslepulver', 'vassleprotein',
    'kärnmjölk', 'kärnmjölkspulver',
    'mjölk', 'mjölkpulver', 'mjölkprotein', 'mjölkfett',
    'ost', 'ostpulver', 'parmesanost', 'cheddarost', 'mozzarella',
    'kasein', 'kaseinat',
    'laktos', 'laktalbumin', 'laktoglobulin',
    'grädde', 'gräddpulver', 'vispgrädde', 'matlagningsgrädde',
    'smör', 'smörolja', 'animaliskt smörfett', 'ghee',
    'yoghurt', 'yoghurtpulver', 'grekisk yoghurt',
    'kefir', 'kvarg', 'ricotta',
    'kondenserad mjölk', 'kondenserad', 'crème fraiche',
    'mascarpone', 'cottage cheese',
  
    // Äggprodukter
    'ägg', 'äggpulver', 'äggalbumin', 'äggula', 'äggvita',
    'torkad äggvita', 'maräng', 'majonnäs', 'aioli',
    'äggersättning med ägg', 'lysozym', 'ovalbumin',
  
    // Honung och biprodukter
    'honung', 'bivax', 'propolis', 'royal jelly', 'kunglig gelé',
    'bipollen', 'honungsextrakt',
  
    // Kött och köttprodukter
    'kött', 'köttextrakt', 'köttbuljong', 'köttfond',
    'nötkött', 'fläskkött', 'kycklingkött', 'lammkött',
    'bacon', 'skinka', 'korv', 'salami', 'chorizo',
    'gelatin', 'kollagen', 'benmjöl', 'köttprotein',
    'kalvkött', 'vilt', 'anka', 'gås', 'kalkon',
    'leverpastej', 'paté', 'sylta',
  
    // Fisk och skaldjur
    'fisk', 'fisksås', 'fiskolja', 'fiskmjöl',
    'skaldjur', 'räkor', 'hummer', 'krabba', 'musslor',
    'tonfisk', 'lax', 'ansjovis', 'sardeller',
    'kaviar', 'rom', 'surimi', 'krabbkött',
    'sillextrakt', 'ostron', 'kammusslor', 'bläckfisk',
  
    // Animaliska tillsatser
    'karmin', 'karminsyra', 'cochenille', 'e120',
    'isinglass', 'husbloss',
    'lanolin', 'ullfett',
    'shellack', 'skellack',
    'elastin', 'keratin',
    'pepsin', 'löpe', 'kymosin',
    'benkol', 'benaska', 'benmärg',
    'animaliskt kol', 'animalisk gelatin'
  ]);
  
  // Ingredienser som KAN vara icke-veganska och kräver extra granskning
  export const POTENTIALLY_NON_VEGAN = new Set([
    // E-nummer som kan vara animaliska
    'e470', 'e471', 'e472', 'e473', 'e474', 'e475', 
    'e476', 'e477', 'e478', 'e479', 'e481', 'e482', 
    'e483', 'e484', 'e485', 'e542', 'e631', 'e635',
    'e904', 'e920', 'e1105',
    
    // Tillsatser och vitaminer
    'glycerin', 'glycerol',
    'lecitin', 'e322',
    'mono', 'diglycerider', 'monoglycerider', 'diglycerider',
    'stearinsyra', 'stearater',
    'vitamin d3', 'kolekalciferol',
    'omega-3', 'dha', 'epa',
    'd-vitamin', 'a-vitamin', 'a-palmitat',
    
    // Enzymer och proteiner
    'enzym', 'enzymer',
    'löpe', 'löpeenzym',
    'protein', 'proteinhydrolysat',
    'aminosyror', 'l-cystin', 'cystein',
    'hydrolyserat protein',
    
    // Fetter och oljor
    'fett', 'matfett',
    'olja', 'fettsyror',
    'stearin', 'stearinsyra',
    
    // Övriga
    'arom', 'naturlig arom',
    'emulgeringsmedel', 'emulgator',
    'stabiliseringsmedel', 'stabilisator',
    'klargöringsmedel', 'klarningsmedel',
    'antioxidationsmedel', 'konserveringsmedel'
  ]);
  
  // Ord som indikerar animaliskt ursprung
  export const ANIMAL_INDICATORS = new Set([
    // Swedish terms
    'animalisk', 'animaliskt',
    'kött', 'kötthaltigt',
    'fisk', 'fiskhaltigt',
    'skaldjur', 'skaldjurshaltigt',
    'mejer', 'mejeri',
    'slakt', 'slakteri',
    'djur', 'djurprodukt',
    'gris', 'nöt', 'får',
    'häst', 'get', 'hjort',
    'kyckling', 'höns', 'kalkon',
    'ägg', 'äggprodukt',
    'ost', 'ostprodukt',
    'mjölk', 'mjölkprodukt',
    'honung', 'bivax',
    'gelatin', 'kollagen',
    'vassle', 'smör', 'grädde',
    
    // English terms
    'animal', 'meat', 'fish',
    'dairy', 'milk', 'cheese',
    'egg', 'honey', 'beeswax',
    'gelatin', 'collagen',
    'whey', 'butter', 'cream',
    'seafood', 'shellfish',
    'chicken', 'beef', 'pork',
    'mutton', 'lamb'
  ]);
  
  // Kända säkra undantag - ingredienser som kan låta icke-veganska men är veganska
  export const SAFE_EXCEPTIONS = new Set([
    // Syror och vinäger
    'mjölksyra', 'citronsyra',
    'äppelcidervinäger', 'balsamvinäger',
    'vinäger', 'ättika',
    'vinsyra', 'askorbinsyra',
    
    // Växtbaserade mjölk och mejeri
    'kokosmjölk', 'kokosgrädde', 'kokosdryck',
    'sojamjölk', 'sojadryck', 'sojagrädde',
    'havremjölk', 'havredryck', 'havregrädde',
    'mandelmjölk', 'mandeldryck',
    'rismjölk', 'risdryck',
    'cashewmjölk', 'nötmjölk',
    'sojaost', 'vegansk ost',
    'växtgrädde', 'växtbaserad grädde',
    'växtmjölk', 'växtdryck',
    'växtost', 'vegansk färskost',
    
    // Växtbaserade smör och oljor
    'jordnötssmör', 'mandelsmör',
    'kakaosmör', 'sheasmör',
    'margarin', 'vegetabiliskt margarin',
    'kokosfett', 'palmolja',
    'rapsolja', 'olivolja',
    
    // Växtbaserade produkter
    'köttväxter', 'växtfärs',
    'växtbaserad', 'växtbaserat',
    'vegetabilisk', 'vegetabiliskt',
    'ärtprotein', 'sojaprotein',
    'havreprotein', 'veteprotein',
    'seitan', 'tempeh', 'tofu',
    
    // Grönsaker och frukter som kan misstas
    'äggplanta',
    'kokosfett', 'kokoskött',
    'jackfrukt', 'svampprotein',
    
    // E-nummer som är säkert veganska
    'e300', 'e301', 'e302', 'e330', 'e440',
    'e406', 'e410', 'e412', 'e415', 'e417'
  ]);