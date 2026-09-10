import type { Language } from "./i18n";

export const WORD_POOL = ["CAT", "FOOD", "WHILE", "THANKS", "FOREACH"] as const;
export type WordToken = (typeof WORD_POOL)[number];

export interface AchievementDef {
  id: string;
  title: Record<Language, string>;
  description: Record<Language, string>;
}

const SCORE_THRESHOLDS = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000];
const BISCUIT_THRESHOLDS = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000];
const CAT_THRESHOLDS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const LEVEL_THRESHOLDS = [2, 3, 4, 5, 6, 7];
const RUN_THRESHOLDS = [1, 10, 20, 30, 40, 50];

function copy(
  en: [string, string],
  fr: [string, string],
  de: [string, string],
  es: [string, string],
  it: [string, string],
): Pick<AchievementDef, "title" | "description"> {
  return {
    title: { en: en[0], fr: fr[0], de: de[0], es: es[0], it: it[0] },
    description: { en: en[1], fr: fr[1], de: de[1], es: es[1], it: it[1] },
  };
}

const SCORE_COPY: Record<number, Pick<AchievementDef, "title" | "description">> = {
  1000: copy(
    ["Four-Digit Feline", "Score greater than 1,000"],
    ["Félin à 4 chiffres", "Score supérieur à 1 000"],
    ["Vier-Stellen-Fell", "Punktzahl über 1.000"],
    ["Felino de 4 cifras", "Puntuación mayor que 1.000"],
    ["Felino a 4 cifre", "Punteggio maggiore di 1.000"],
  ),
  2000: copy(
    ["Double Scoop", "Score greater than 2,000"],
    ["Double ration", "Score supérieur à 2 000"],
    ["Doppelte Portion", "Punktzahl über 2.000"],
    ["Doble ración", "Puntuación mayor que 2.000"],
    ["Doppia razione", "Punteggio maggiore di 2.000"],
  ),
  3000: copy(
    ["Thousandaire", "Score greater than 3,000"],
    ["Millionnaire du thon", "Score supérieur à 3 000"],
    ["Punkt-Millionär", "Punktzahl über 3.000"],
    ["Milmillonario", "Puntuación mayor que 3.000"],
    ["Miliardario di tonno", "Punteggio maggiore di 3.000"],
  ),
  4000: copy(
    ["Purrfect 4000", "Score greater than 4,000"],
    ["Ronron 4000", "Score supérieur à 4 000"],
    ["Schnurrperfekt 4000", "Punktzahl über 4.000"],
    ["Purrfecto 4000", "Puntuación mayor que 4.000"],
    ["Purrfetto 4000", "Punteggio maggiore di 4.000"],
  ),
  5000: copy(
    ["High Five Thousand", "Score greater than 5,000"],
    ["High five mille", "Score supérieur à 5 000"],
    ["High Five Tausend", "Punktzahl über 5.000"],
    ["Choca esos 5.000", "Puntuación mayor que 5.000"],
    ["Batti il cinque mila", "Punteggio maggiore di 5.000"],
  ),
  6000: copy(
    ["Six-Pack Points", "Score greater than 6,000"],
    ["Meute à 6 000", "Score supérieur à 6 000"],
    ["Sechserpack", "Punktzahl über 6.000"],
    ["Manada 6.000", "Puntuación mayor que 6.000"],
    ["Branco da 6.000", "Punteggio maggiore di 6.000"],
  ),
  7000: copy(
    ["Lucky 7000", "Score greater than 7,000"],
    ["7 000 de chance", "Score supérieur à 7 000"],
    ["Glückszahl 7000", "Punktzahl über 7.000"],
    ["Suerte 7000", "Puntuación mayor que 7.000"],
    ["Fortuna 7000", "Punteggio maggiore di 7.000"],
  ),
  8000: copy(
    ["Ate Thousand", "Score greater than 8,000"],
    ["8 000 croquettes", "Score supérieur à 8 000"],
    ["Acht Tausend Happen", "Punktzahl über 8.000"],
    ["Se comió 8.000", "Puntuación mayor que 8.000"],
    ["Si è mangiato 8.000", "Punteggio maggiore di 8.000"],
  ),
  9000: copy(
    ["Nine Lives of Score", "Score greater than 9,000"],
    ["Neuf vies de score", "Score supérieur à 9 000"],
    ["Neun Leben Punkte", "Punktzahl über 9.000"],
    ["Nueve vidas de puntos", "Puntuación mayor que 9.000"],
    ["Nove vite di punteggio", "Punteggio maggiore di 9.000"],
  ),
  10000: copy(
    ["Five-Figure Club", "Score greater than 10,000"],
    ["Club à 5 chiffres", "Score supérieur à 10 000"],
    ["Fünf-Stellen-Club", "Punktzahl über 10.000"],
    ["Club de 5 cifras", "Puntuación mayor que 10.000"],
    ["Club a 5 cifre", "Punteggio maggiore di 10.000"],
  ),
};

const BISCUIT_COPY: Record<number, Pick<AchievementDef, "title" | "description">> = {
  1000: copy(
    ["Biscuit Beginner", "You earned 1,000 biscuits in total"],
    ["Débutant biscuit", "Tu as obtenu 1 000 biscuits en tout"],
    ["Keks-Anfänger", "Du hast insgesamt 1.000 Kekse erhalten"],
    ["Principiante galleta", "Has obtenido 1.000 galletas en total"],
    ["Principiante dei biscotti", "Hai ottenuto 1.000 biscotti in totale"],
  ),
  2000: copy(
    ["Jar Hoarder", "You earned 2,000 biscuits in total"],
    ["Coffre à biscuits", "Tu as obtenu 2 000 biscuits en tout"],
    ["Glas-Horter", "Du hast insgesamt 2.000 Kekse erhalten"],
    ["Tarro lleno", "Has obtenido 2.000 galletas en total"],
    ["Barattolo pieno", "Hai ottenuto 2.000 biscotti in totale"],
  ),
  3000: copy(
    ["Crumbs of Fortune", "You earned 3,000 biscuits in total"],
    ["Fortune en miettes", "Tu as obtenu 3 000 biscuits en tout"],
    ["Krümelglück", "Du hast insgesamt 3.000 Kekse erhalten"],
    ["Fortuna en migas", "Has obtenido 3.000 galletas en total"],
    ["Fortuna in briciole", "Hai ottenuto 3.000 biscotti in totale"],
  ),
  4000: copy(
    ["Paw Bakery", "You earned 4,000 biscuits in total"],
    ["Pâtisserie patte", "Tu as obtenu 4 000 biscuits en tout"],
    ["Pfotenbäckerei", "Du hast insgesamt 4.000 Kekse erhalten"],
    ["Panadería pata", "Has obtenido 4.000 galletas en total"],
    ["Pasticceria zampa", "Hai ottenuto 4.000 biscotti in totale"],
  ),
  5000: copy(
    ["Snack Capital", "You earned 5,000 biscuits in total"],
    ["Capitale du snack", "Tu as obtenu 5 000 biscuits en tout"],
    ["Snack-Hauptstadt", "Du hast insgesamt 5.000 Kekse erhalten"],
    ["Capital del snack", "Has obtenido 5.000 galletas en total"],
    ["Capitale dello snack", "Hai ottenuto 5.000 biscotti in totale"],
  ),
  6000: copy(
    ["Cookie Cartel", "You earned 6,000 biscuits in total"],
    ["Cartel du cookie", "Tu as obtenu 6 000 biscuits en tout"],
    ["Keks-Kartell", "Du hast insgesamt 6.000 Kekse erhalten"],
    ["Cártel de galletas", "Has obtenido 6.000 galletas en total"],
    ["Cartello dei biscotti", "Hai ottenuto 6.000 biscotti in totale"],
  ),
  7000: copy(
    ["Lucky Oven", "You earned 7,000 biscuits in total"],
    ["Four chanceux", "Tu as obtenu 7 000 biscuits en tout"],
    ["Glücksofen", "Du hast insgesamt 7.000 Kekse erhalten"],
    ["Horno de la suerte", "Has obtenido 7.000 galletas en total"],
    ["Forno fortunato", "Hai ottenuto 7.000 biscotti in totale"],
  ),
  8000: copy(
    ["Dough Magnate", "You earned 8,000 biscuits in total"],
    ["Magnat de la pâte", "Tu as obtenu 8 000 biscuits en tout"],
    ["Teig-Tycoon", "Du hast insgesamt 8.000 Kekse erhalten"],
    ["Magnate de la masa", "Has obtenido 8.000 galletas en total"],
    ["Magnate dell’impasto", "Hai ottenuto 8.000 biscotti in totale"],
  ),
  9000: copy(
    ["Nine Thousand Nibbles", "You earned 9,000 biscuits in total"],
    ["9 000 bouchées", "Tu as obtenu 9 000 biscuits en tout"],
    ["Neun Tausend Happen", "Du hast insgesamt 9.000 Kekse erhalten"],
    ["Nueve mil mordiscos", "Has obtenido 9.000 galletas en total"],
    ["Novemila morsi", "Hai ottenuto 9.000 biscotti in totale"],
  ),
  10000: copy(
    ["Biscuit Billionaire", "You earned 10,000 biscuits in total"],
    ["Milliardaire biscuit", "Tu as obtenu 10 000 biscuits en tout"],
    ["Keks-Milliardär", "Du hast insgesamt 10.000 Kekse erhalten"],
    ["Multimillonario galleta", "Has obtenido 10.000 galletas en total"],
    ["Miliardario di biscotti", "Hai ottenuto 10.000 biscotti in totale"],
  ),
};

const CAT_COPY: Record<number, Pick<AchievementDef, "title" | "description">> = {
  10: copy(
    ["Street Recruiter", "You recruited 10 kittens"],
    ["Recruteur des rues", "Tu as recruté 10 chatons"],
    ["Gassen-Recruiter", "Du hast 10 Kätzchen angeworben"],
    ["Reclutador callejero", "Has reclutado 10 gatitos"],
    ["Reclutatore di strada", "Hai arruolato 10 gattini"],
  ),
  20: copy(
    ["Alley Boss", "You recruited 20 kittens"],
    ["Patron de ruelle", "Tu as recruté 20 chatons"],
    ["Gassenboss", "Du hast 20 Kätzchen angeworben"],
    ["Jefe del callejón", "Has reclutado 20 gatitos"],
    ["Boss del vicolo", "Hai arruolato 20 gattini"],
  ),
  30: copy(
    ["Colony Manager", "You recruited 30 kittens"],
    ["Chef de colonie", "Tu as recruté 30 chatons"],
    ["Kolonie-Manager", "Du hast 30 Kätzchen angeworben"],
    ["Gerente de colonia", "Has reclutado 30 gatitos"],
    ["Manager della colonia", "Hai arruolato 30 gattini"],
  ),
  40: copy(
    ["Herding Cats", "You recruited 40 kittens"],
    ["Berger de chats", "Tu as recruté 40 chatons"],
    ["Katzenhüter", "Du hast 40 Kätzchen angeworben"],
    ["Pastor de gatos", "Has reclutado 40 gatitos"],
    ["Pastore di gatti", "Hai arruolato 40 gattini"],
  ),
  50: copy(
    ["Half a Hundred", "You recruited 50 kittens"],
    ["Demi-centaine", "Tu as recruté 50 chatons"],
    ["Halbes Hundert", "Du hast 50 Kätzchen angeworben"],
    ["Media centena", "Has reclutado 50 gatitos"],
    ["Mezza centinaia", "Hai arruolato 50 gattini"],
  ),
  60: copy(
    ["Cat Bus", "You recruited 60 kittens"],
    ["Bus à chats", "Tu as recruté 60 chatons"],
    ["Katzenbus", "Du hast 60 Kätzchen angeworben"],
    ["Autobús gatuno", "Has reclutado 60 gatitos"],
    ["Catbus", "Hai arruolato 60 gattini"],
  ),
  70: copy(
    ["Meow Militia", "You recruited 70 kittens"],
    ["Milice miaou", "Tu as recruté 70 chatons"],
    ["Miau-Miliz", "Du hast 70 Kätzchen angeworben"],
    ["Milicia miau", "Has reclutado 70 gatitos"],
    ["Milizia miao", "Hai arruolato 70 gattini"],
  ),
  80: copy(
    ["Purr Battalion", "You recruited 80 kittens"],
    ["Bataillon ronron", "Tu as recruté 80 chatons"],
    ["Schnurr-Bataillon", "Du hast 80 Kätzchen angeworben"],
    ["Batallón ronroneo", "Has reclutado 80 gatitos"],
    ["Battaglione fusa", "Hai arruolato 80 gattini"],
  ),
  90: copy(
    ["Almost a Hundred", "You recruited 90 kittens"],
    ["Presque cent", "Tu as recruté 90 chatons"],
    ["Fast hundert", "Du hast 90 Kätzchen angeworben"],
    ["Casi cien", "Has reclutado 90 gatitos"],
    ["Quasi cento", "Hai arruolato 90 gattini"],
  ),
  100: copy(
    ["Century of Cats", "You recruited 100 kittens"],
    ["Siècle de chats", "Tu as recruté 100 chatons"],
    ["Jahrhundert Katzen", "Du hast 100 Kätzchen angeworben"],
    ["Siglo de gatos", "Has reclutado 100 gatitos"],
    ["Secolo di gatti", "Hai arruolato 100 gattini"],
  ),
};

const WORD_COPY: Record<WordToken, Pick<AchievementDef, "title" | "description">> = {
  CAT: copy(
    ["Spells CAT", "You found the word CAT"],
    ["Ça s’écrit CAT", "Tu as trouvé le mot CAT"],
    ["Buchstabiert CAT", "Du hast das Wort CAT gefunden"],
    ["Se escribe CAT", "Has encontrado la palabra CAT"],
    ["Si scrive CAT", "Hai trovato la parola CAT"],
  ),
  FOOD: copy(
    ["Snack Decoder", "You found the word FOOD"],
    ["Décodeur de snacks", "Tu as trouvé le mot FOOD"],
    ["Snack-Decoder", "Du hast das Wort FOOD gefunden"],
    ["Decodificador de snacks", "Has encontrado la palabra FOOD"],
    ["Decodificatore di snack", "Hai trovato la parola FOOD"],
  ),
  WHILE: copy(
    ["Meanwhile…", "You found the word WHILE"],
    ["Pendant ce temps…", "Tu as trouvé le mot WHILE"],
    ["Währenddessen…", "Du hast das Wort WHILE gefunden"],
    ["Mientras tanto…", "Has encontrado la palabra WHILE"],
    ["Nel frattempo…", "Hai trovato la parola WHILE"],
  ),
  THANKS: copy(
    ["Polite Pack", "You found the word THANKS"],
    ["Meute polie", "Tu as trouvé le mot THANKS"],
    ["Höfliches Rudel", "Du hast das Wort THANKS gefunden"],
    ["Manada educada", "Has encontrado la palabra THANKS"],
    ["Branco educato", "Hai trovato la parola THANKS"],
  ),
  FOREACH: copy(
    ["Loop Legend", "You found the word FOREACH"],
    ["Légende de boucle", "Tu as trouvé le mot FOREACH"],
    ["Schleifen-Legende", "Du hast das Wort FOREACH gefunden"],
    ["Leyenda del bucle", "Has encontrado la palabra FOREACH"],
    ["Leggenda del ciclo", "Hai trovato la parola FOREACH"],
  ),
};

const LEVEL_COPY: Record<number, Pick<AchievementDef, "title" | "description">> = {
  2: copy(
    ["Second Wind", "Reach level 2"],
    ["Second souffle", "Atteins le niveau 2"],
    ["Zweiter Wind", "Erreiche Level 2"],
    ["Segundo aire", "Alcanza el nivel 2"],
    ["Secondo fiato", "Raggiungi il livello 2"],
  ),
  3: copy(
    ["Third Time’s the Charm", "Reach level 3"],
    ["Jamais deux sans trois", "Atteins le niveau 3"],
    ["Aller guten Dinge 3", "Erreiche Level 3"],
    ["A la tercera va", "Alcanza el nivel 3"],
    ["Mai due senza tre", "Raggiungi il livello 3"],
  ),
  4: copy(
    ["Four Worlds Later", "Reach level 4"],
    ["Quatre mondes plus tard", "Atteins le niveau 4"],
    ["Vier Welten später", "Erreiche Level 4"],
    ["Cuatro mundos después", "Alcanza el nivel 4"],
    ["Quattro mondi dopo", "Raggiungi il livello 4"],
  ),
  5: copy(
    ["High Five", "Reach level 5"],
    ["High five", "Atteins le niveau 5"],
    ["High Five", "Erreiche Level 5"],
    ["Choca esos cinco", "Alcanza el nivel 5"],
    ["Batti il cinque", "Raggiungi il livello 5"],
  ),
  6: copy(
    ["Deep Pack", "Reach level 6"],
    ["Meute profonde", "Atteins le niveau 6"],
    ["Tiefes Rudel", "Erreiche Level 6"],
    ["Manada profunda", "Alcanza el nivel 6"],
    ["Branco profondo", "Raggiungi il livello 6"],
  ),
  7: copy(
    ["Lucky Seven", "Reach level 7"],
    ["Sept chanceux", "Atteins le niveau 7"],
    ["Glückliche Sieben", "Erreiche Level 7"],
    ["Siete de la suerte", "Alcanza el nivel 7"],
    ["Sette fortunato", "Raggiungi il livello 7"],
  ),
};

const RUN_COPY: Record<number, Pick<AchievementDef, "title" | "description">> = {
  1: copy(
    ["First Pawsteps", "Complete 1 run"],
    ["Premiers pas", "Termine 1 course"],
    ["Erste Pfotenschritte", "Absolviere 1 Lauf"],
    ["Primeros pasos", "Completa 1 carrera"],
    ["Primi passi", "Fai 1 run"],
  ),
  10: copy(
    ["Ten-Timer", "Complete 10 runs"],
    ["Dix fois dans la rue", "Termine 10 courses"],
    ["Zehnmal unterwegs", "Absolviere 10 Läufe"],
    ["Diez carreras", "Completa 10 carreras"],
    ["Dieci corse", "Fai 10 run"],
  ),
  20: copy(
    ["Habit Forming", "Complete 20 runs"],
    ["C’est une habitude", "Termine 20 courses"],
    ["Zur Gewohnheit", "Absolviere 20 Läufe"],
    ["Ya es costumbre", "Completa 20 carreras"],
    ["Ora è un’abitudine", "Fai 20 run"],
  ),
  30: copy(
    ["Marathon Meow", "Complete 30 runs"],
    ["Miaou marathon", "Termine 30 courses"],
    ["Miau-Marathon", "Absolviere 30 Läufe"],
    ["Maratón miau", "Completa 30 carreras"],
    ["Maratona miao", "Fai 30 run"],
  ),
  40: copy(
    ["Street Regular", "Complete 40 runs"],
    ["Habitué des rues", "Termine 40 courses"],
    ["Stammgast", "Absolviere 40 Läufe"],
    ["Fijo de la calle", "Completa 40 carreras"],
    ["Fisso di strada", "Fai 40 run"],
  ),
  50: copy(
    ["Fifty Shades of Fur", "Complete 50 runs"],
    ["Cinquante fourrures", "Termine 50 courses"],
    ["Fünfzig Fellrunden", "Absolviere 50 Läufe"],
    ["Cincuenta pelajes", "Completa 50 carreras"],
    ["Cinquanta sfumature di pelo", "Fai 50 run"],
  ),
};

export const ACHIEVEMENTS: AchievementDef[] = [
  ...SCORE_THRESHOLDS.map((threshold) => ({
    id: `score-${threshold}`,
    ...SCORE_COPY[threshold],
  })),
  ...CAT_THRESHOLDS.map((threshold) => ({
    id: `cats-${threshold}`,
    ...CAT_COPY[threshold],
  })),
  ...BISCUIT_THRESHOLDS.map((threshold) => ({
    id: `biscuits-${threshold}`,
    ...BISCUIT_COPY[threshold],
  })),
  ...WORD_POOL.map((word) => ({
    id: `word-${word}`,
    ...WORD_COPY[word],
  })),
  {
    id: "death-instant",
    ...copy(
      ["Speedrun: Fail", "Die immediately"],
      ["Speedrun : échec", "Meurs tout de suite"],
      ["Speedrun: Fail", "Stirb sofort"],
      ["Speedrun: fail", "Muere al instante"],
      ["Speedrun: fail", "Muori subito"],
    ),
  },
  {
    id: "death-first",
    ...copy(
      ["The First Scratch", "Your first death"],
      ["La première griffure", "Ta première mort"],
      ["Der erste Kratzer", "Dein erster Tod"],
      ["El primer arañazo", "Tu primera muerte"],
      ["Il primo graffio", "La tua prima morte"],
    ),
  },
  ...LEVEL_THRESHOLDS.map((threshold) => ({
    id: `level-${threshold}`,
    ...LEVEL_COPY[threshold],
  })),
  ...RUN_THRESHOLDS.map((threshold) => ({
    id: `runs-${threshold}`,
    ...RUN_COPY[threshold],
  })),
];

export const SCORE_ACHIEVEMENT_THRESHOLDS = SCORE_THRESHOLDS;
export const CAT_ACHIEVEMENT_THRESHOLDS = CAT_THRESHOLDS;
export const BISCUIT_ACHIEVEMENT_THRESHOLDS = BISCUIT_THRESHOLDS;
export const LEVEL_ACHIEVEMENT_THRESHOLDS = LEVEL_THRESHOLDS;
export const RUN_ACHIEVEMENT_THRESHOLDS = RUN_THRESHOLDS;

export function achievementById(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((item) => item.id === id);
}
