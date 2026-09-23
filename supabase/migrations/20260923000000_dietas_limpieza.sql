-- Dietas (Menu A / Menu B de la Dra. Adriana Ochoa) y lista de limpieza
-- compartida (la del pizarron "Limpieza Sabado"). Base para el feed .ics de
-- calendario: cada comida y el sabado de limpieza se convierten en eventos
-- recurrentes que Brandon e Itzel se suscriben una vez desde su Google
-- Calendar -- VentasPro nunca manda un correo, solo publica el feed.

CREATE TABLE IF NOT EXISTS dietas_menus (
  id     SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS dietas_comidas (
  id        SERIAL PRIMARY KEY,
  menu_id   INTEGER NOT NULL REFERENCES dietas_menus(id) ON DELETE CASCADE,
  -- 1 = lunes ... 7 = domingo (ISO), para que coincida con RRULE del .ics.
  dia       SMALLINT NOT NULL CHECK (dia BETWEEN 1 AND 7),
  tiempo    TEXT NOT NULL CHECK (tiempo IN ('desayuno','colacion1','comida','colacion2','cena')),
  hora      TIME NOT NULL,
  titulo    TEXT NOT NULL,
  detalle   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dietas_comidas_menu ON dietas_comidas (menu_id, dia, tiempo);

-- Cual PDF original corresponde a cada menu (o a ninguno, como la tabla de
-- equivalentes). El archivo vive en el bucket privado 'dietas', se lee con
-- URL firmada igual que pdf_reportes.
CREATE TABLE IF NOT EXISTS dietas_archivos (
  id           SERIAL PRIMARY KEY,
  menu_id      INTEGER REFERENCES dietas_menus(id) ON DELETE SET NULL,
  nombre       TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- La lista del pizarron "Limpieza Sabado", digitalizada.
CREATE TABLE IF NOT EXISTS limpieza_tareas (
  id     SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  orden  INTEGER NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT TRUE
);

-- Un check por tarea y semana. La semana se identifica por el sabado (fecha),
-- asi el pizarron se "borra" solo: llega el sabado siguiente y no hay fila.
CREATE TABLE IF NOT EXISTS limpieza_estado (
  tarea_id  INTEGER NOT NULL REFERENCES limpieza_tareas(id) ON DELETE CASCADE,
  semana    DATE NOT NULL,
  hecho_por TEXT,
  hecho_en  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tarea_id, semana)
);

ALTER TABLE dietas_menus     DISABLE ROW LEVEL SECURITY;
ALTER TABLE dietas_comidas   DISABLE ROW LEVEL SECURITY;
ALTER TABLE dietas_archivos  DISABLE ROW LEVEL SECURITY;
ALTER TABLE limpieza_tareas  DISABLE ROW LEVEL SECURITY;
ALTER TABLE limpieza_estado  DISABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('dietas', 'dietas', FALSE, 20971520, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- ── Menus ────────────────────────────────────────────────────────────────
INSERT INTO dietas_menus (id, nombre, activo) VALUES
  (1, 'Menú A', TRUE),
  (2, 'Menú B', FALSE)
ON CONFLICT (id) DO NOTHING;
SELECT setval('dietas_menus_id_seq', 2);

-- ── Comidas ──────────────────────────────────────────────────────────────
DELETE FROM dietas_comidas;
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (1, 1, 'desayuno', '08:00', 'Huevo con verdura', '2 pzas de huevo revuelto con 1/2 pza de tomate y cebolla picada.
1 cdita de aceite de oliva.
1/4 de aguacate.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (1, 1, 'colacion1', '11:00', 'Fruta', '1 taza de piña en cubos.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (1, 1, 'comida', '14:00', 'Sándwich de pollo', '2 pzas de pan integral light.
100g de pechuga de pollo asada.
1 cdita de mayonesa light, lechuga, cebolla y tomate.
Acompañar con 2 tazas de pepino y zanahoria rallada.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (1, 1, 'colacion2', '17:30', 'Colación', '1 taza de pepino con limón y tajín.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (1, 1, 'cena', '20:00', 'Taco de queso', '1 pza de tortilla de maíz.
30g de queso fresco o panela.
1/2 taza de salsa mexicana natural.
1 taza de yogurt natural sin azúcar.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (1, 2, 'desayuno', '08:00', 'Omelette con Tortilla', '2 pzas de huevo batido con cebolla y 2/3 de chile verde.
Cocinar con 1 cdita de aceite.
Acompañar con 1 pza de tortilla.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (1, 2, 'colacion1', '11:00', 'Fruta', '1 taza de piña fresca.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (1, 2, 'comida', '14:00', 'Bistec de res', '100g de bistec de res magro asado.
1/2 pza de papa cocida en cubos.
Cocinar con 1 cdita de aceite, cebolla y chile verde.
1 pza de tortilla.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (1, 2, 'colacion2', '17:30', 'Colación', '1 taza de camote cocido al vapor.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (1, 2, 'cena', '20:00', 'Sándwich de jamón', '2 pzas de pan integral.
2 rebanadas de jamón de pavo light.
1 cdita de mayonesa light, lechuga, cebolla y tomate.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (1, 3, 'desayuno', '08:00', 'Quesadillas con Salsa', '2 tortillas de maíz al comal.
30g de queso panela derretido.
1 taza de salsa mexicana casera.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (1, 3, 'colacion1', '11:00', 'Fruta', '1 pieza de manzana verde.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (1, 3, 'comida', '14:00', 'Entomatadas de pollo', '2 pzas de tortilla rellenas de 100g de pechuga de pollo deshebrada.
Bañadas en 1/4 taza de puré de tomate natural.
Servir con lechuga, cebolla y tomate picado.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (1, 3, 'colacion2', '17:30', 'Fruta', '1 taza de papaya o uvas frescas.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (1, 3, 'cena', '20:00', 'Sincronizadas ligeras', '2 pzas de tortilla de maíz.
40g de queso panela.
2 cdas de aguacate machacado.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (1, 4, 'desayuno', '08:00', 'Enfrijoladas Fit', '2 pzas de tortillas pasadas por 1/2 taza de frijol negro cocido y molido sin grasa.
Espolvorear 40g de queso fresco.
1/2 taza de salsa mexicana y 2 cdas de aguacate.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (1, 4, 'colacion1', '11:00', 'Fruta', '1 pieza de manzana.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (1, 4, 'comida', '14:00', 'Ceviche de atún', '100g de atún en agua drenado.
Mezclar con pepino, cebolla, 1 pza de tomate y 1/2 taza de zanahoria rallada.
Acompañar con 1 pza de tortilla tostada al comal.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (1, 4, 'colacion2', '17:30', 'Fruta', '1 pieza de naranja entera.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (1, 4, 'cena', '20:00', 'Cereal con leche', '1 taza de cereal integral alto en fibra.
1 taza de leche descremada.
1/2 pieza de manzana picada.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (1, 5, 'desayuno', '08:00', 'Ejote con huevo', '2 pzas de huevo revueltos con 1/2 taza de ejotes cocidos.
1 cdita de aceite de oliva.
1 pza de pan integral tostado.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (1, 5, 'colacion1', '11:00', 'Fruta con nuez', '1 taza de fresas rebanadas con 7 pzas de cacahuates naturales.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (1, 5, 'comida', '14:00', 'Tostadas de carne molida', '2 pzas de tortilla tostadas al comal.
100g de carne molida de res magra cocinada con verduras (lechuga, cebolla, 1/2 taza de zanahoria rallada).');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (1, 5, 'colacion2', '17:30', 'Fruta', '1 pieza de manzana verde.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (1, 5, 'cena', '20:00', 'Sincronizadas panela', '2 pzas de tortilla de maíz.
40g de queso panela al comal.
2 cdas de aguacate.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (1, 6, 'desayuno', '08:00', 'Omelette verde', '2 pzas de huevo batido con cebolla y chile verde al gusto.
1 pza de tortilla de maíz al comal.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (1, 6, 'colacion1', '11:00', 'Fruta con pistache', '1 pieza de manzana con 18 pzas de pistaches naturales.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (1, 6, 'comida', '14:00', 'Pescado empapelado', '100g de filete de tilapia empapelado al horno con tomate, cebolla y chile verde.
1 cdita de mayonesa light y mostaza al gusto.
2 pzas de tortilla tostadas al comal.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (1, 6, 'colacion2', '17:30', 'Fruta', '1 taza de jícama o pepino picado.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (1, 6, 'cena', '20:00', 'Pan con queso cottage', '1 pza de pan integral tostado al comal.
3 cdas de queso cottage regular.
Acompañar con 1 pieza de manzana pequeña.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (1, 7, 'desayuno', '08:00', 'Huevo con verdura integral', '2 pzas de clara de huevo revueltas con 1/2 pza de tomate y cebolla.
Acompañar con 2 tostadas deshidratadas.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (1, 7, 'colacion1', '11:00', 'Camote', '1 taza de camote cocido al vapor.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (1, 7, 'comida', '14:00', 'Salmón a la plancha', '100g de filete de salmón fresco cocinado a la plancha.
Ensalada verde abundante al gusto.
1/4 de pieza de aguacate.
2 salmas o galletas horneadas.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (1, 7, 'colacion2', '17:30', 'Fruta', '1 pieza de naranja.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (1, 7, 'cena', '20:00', 'Pan con queso panela', '1 pza de pan integral tostado.
40g de queso panela asado.
1/2 taza de salsa mexicana.
1 cdita de mayonesa light y 2 cdas de aguacate.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (2, 1, 'desayuno', '08:00', 'Avena Nocturna con Chía', '1/2 taza de avena integral en hojuelas hidratada en 1 taza de leche de almendras.
1 cda de semillas de chía y 1/2 taza de berries.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (2, 1, 'colacion1', '11:00', 'Fruta', '1 manzana verde mediana.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (2, 1, 'comida', '14:00', 'Pollo cítrico con quinoa', '120g de pechuga de pollo marinada en limón y hierbas asada.
1/2 taza de quinoa cocida.
Ensalada de espinacas y pepino.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (2, 1, 'colacion2', '17:30', 'Fruta', '1 taza de melón picado.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (2, 1, 'cena', '20:00', 'Tostadas de aguacate y requesón', '2 tostadas horneadas deshidratadas.
4 cdas de requesón magro.
1/4 de aguacate machacado con pizca de sal y pimienta.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (2, 2, 'desayuno', '08:00', 'Huevo revuelto con espinacas', '2 pzas de huevo entero revueltos con 1 taza de espinacas baby picadas.
1 cdita de aceite de aguacate.
1 pza de pan integral tostado.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (2, 2, 'colacion1', '11:00', 'Fruta', '1 taza de papaya en cubos con limón.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (2, 2, 'comida', '14:00', 'Tacos de pescado grill', '120g de filete de pescado blanco (fileteado) asado al comal.
2 tortillas de maíz.
Ensalada de col morada y tomate con aderezo de limón.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (2, 2, 'colacion2', '17:30', 'Almendras', '10 almendras naturales.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (2, 2, 'cena', '20:00', 'Yogurt Bowl Proteico', '1 taza de yogurt griego sin azúcar.
3 cdas de granola alta en fibra (sin azúcar añadida).
Fresas picadas.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (2, 3, 'desayuno', '08:00', 'Pan tostado con hummus y huevo', '1 pza de pan integral grande tostado.
2 cdas de hummus natural casero.
1 huevo poché o estrellado encima con paprika.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (2, 3, 'colacion1', '11:00', 'Fruta', '1 pieza de pera mediana.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (2, 3, 'comida', '14:00', 'Bowl de fajitas de res picantes', '100g de puntas de filete de res salteadas con abundante pimiento morrón y cebolla.
1/2 taza de arroz integral cocido.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (2, 3, 'colacion2', '17:30', 'Jícama', '1 taza de jícama con chile en polvo.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (2, 3, 'cena', '20:00', 'Ensalada de atún ligera', '1 lata de atún en agua picado con apio y tomate.
1 cdita de mayonesa con aceite de oliva.
2 galletas horneadas salmas.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (2, 4, 'desayuno', '08:00', 'Licuado Verde Energético', '1 taza de leche descremada o vegetal.
1 scoop de proteína en polvo (o 3 cdas de avena).
1 taza de espinaca, 1/2 plátano y hielo.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (2, 4, 'colacion1', '11:00', 'Fruta', '1 taza de piña picada.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (2, 4, 'comida', '14:00', 'Milanesa de pollo al horno', '120g de pechuga de pollo empanizada con hojuelas de avena trituradas y horneada.
1 taza de puré de calabacitas y zanahoria.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (2, 4, 'colacion2', '17:30', 'Edamames', '1/2 taza de edamames al vapor con sal de mar.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (2, 4, 'cena', '20:00', 'Sopa de verduras con queso', '1.5 tazas de caldo de verduras casero con calabacita, chayote y apio.
50g de queso panela en cubos fundido dentro del caldo.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (2, 5, 'desayuno', '08:00', 'Chilaquiles ligeros', '2 tortillas horneadas cortadas en totopos.
Bañados en salsa verde casera hervida.
1 huevo estrellado encima y 30g de queso de mesa.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (2, 5, 'colacion1', '11:00', 'Fruta', '1 taza de sandía picada.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (2, 5, 'comida', '14:00', 'Salmón glaseado con naranja', '100g de salmón sellado a la plancha con un toque de jugo de naranja natural.
1 taza de brócoli y coliflor al vapor.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (2, 5, 'colacion2', '17:30', 'Nuez pecana', '5 mitades de nuez pecana.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (2, 5, 'cena', '20:00', 'Quesadilla abierta con champiñones', '1 tortilla de harina integral grande o de linaza.
40g de queso oaxaca bajo en grasa y 1 taza de champiñones al ajillo.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (2, 6, 'desayuno', '08:00', 'Muffins de huevo y vegetales', '2 huevos batidos horneados en moldes con pimientos, champiñones y espinaca.
1 pza de pan integral tostado.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (2, 6, 'colacion1', '11:00', 'Fruta', '1 pieza de mandarina o naranja.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (2, 6, 'comida', '14:00', 'Brochetas de res y vegetales', '100g de cubos de res magra intercalados con cebolla, calabacita y pimientos a la parrilla.
1 pza de elote tierno asado.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (2, 6, 'colacion2', '17:30', 'Pepinos', '1 taza de pepinos con sal y limón.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (2, 6, 'cena', '20:00', 'Pan con crema de cacahuate y fruta', '1 pza de pan integral.
1 cdita de crema de cacahuate 100% natural.
1/2 pieza de manzana verde fileteada encima.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (2, 7, 'desayuno', '08:00', 'Hot cakes de avena y plátano', 'Mezclar 1/3 taza de avena, 1 huevo, 1/2 plátano y vainilla.
Cocinar a la plancha (salen 2 pzas pequeñas).
1 cda de yogurt griego encima.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (2, 7, 'colacion1', '11:00', 'Fruta', '1 taza de fresas.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (2, 7, 'comida', '14:00', 'Tacos de pechuga asada al pastor', '120g de pechuga de pollo picada adobada con chile guajillo y achiote.
2 tortillas de maíz con cebolla, cilantro y piña asada.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (2, 7, 'colacion2', '17:30', 'Pistaches', '18 pzas de pistaches con cáscara.');
INSERT INTO dietas_comidas (menu_id, dia, tiempo, hora, titulo, detalle) VALUES (2, 7, 'cena', '20:00', 'Omelette de claras mediterráneo', '3 claras de huevo batidas con espinaca, jitomate deshidratado o fresco y 30g de queso panela.');

-- ── Lista de limpieza (pizarron) ────────────────────────────────────────
DELETE FROM limpieza_tareas;
INSERT INTO limpieza_tareas (nombre, orden) VALUES ('Sala', 0);
INSERT INTO limpieza_tareas (nombre, orden) VALUES ('Escritorios', 1);
INSERT INTO limpieza_tareas (nombre, orden) VALUES ('Lavar ropa', 2);
INSERT INTO limpieza_tareas (nombre, orden) VALUES ('Lavar cobijas', 3);
INSERT INTO limpieza_tareas (nombre, orden) VALUES ('Lavar toallas', 4);
INSERT INTO limpieza_tareas (nombre, orden) VALUES ('Lavar trapos', 5);
INSERT INTO limpieza_tareas (nombre, orden) VALUES ('Sacar basura', 6);
INSERT INTO limpieza_tareas (nombre, orden) VALUES ('Lavar trastes', 7);
INSERT INTO limpieza_tareas (nombre, orden) VALUES ('Guardar trastes', 8);
INSERT INTO limpieza_tareas (nombre, orden) VALUES ('Limpiar estufa', 9);
INSERT INTO limpieza_tareas (nombre, orden) VALUES ('Limpiar refri', 10);
INSERT INTO limpieza_tareas (nombre, orden) VALUES ('Limpiar micro y mueble', 11);
INSERT INTO limpieza_tareas (nombre, orden) VALUES ('Limpiar mesa', 12);
INSERT INTO limpieza_tareas (nombre, orden) VALUES ('Limpiar cocina', 13);
INSERT INTO limpieza_tareas (nombre, orden) VALUES ('Limpiar bote de cocina', 14);
INSERT INTO limpieza_tareas (nombre, orden) VALUES ('Fregadero', 15);
INSERT INTO limpieza_tareas (nombre, orden) VALUES ('Bebedero y platos', 16);
INSERT INTO limpieza_tareas (nombre, orden) VALUES ('Regadera', 17);
INSERT INTO limpieza_tareas (nombre, orden) VALUES ('Baño', 18);
INSERT INTO limpieza_tareas (nombre, orden) VALUES ('Barrer', 19);
INSERT INTO limpieza_tareas (nombre, orden) VALUES ('Trapear', 20);
INSERT INTO limpieza_tareas (nombre, orden) VALUES ('Mandado', 21);
