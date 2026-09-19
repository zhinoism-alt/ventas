-- Plan de estudios: Ing. en Software y Redes (1549, DGES-2016)
--
-- Las 48 materias curriculares con su seriacion real, tomada de la
-- "Propuesta de Equivalencias" oficial. Ingles On Line I-VI NO aparece
-- aqui a proposito: UNITEC confirmo que es optativa no curricular, y
-- contarla inflaba la carrera en 6 materias y un año de egreso.
--
-- "seriacion" apunta al numero de la materia que hay que aprobar antes.
-- De ahi salen las unicas tres cadenas que existen, que son las que
-- fijan el minimo de cuatrimestres:
--   13 -> 16     (Calculo Vectorial -> Ecuaciones Diferenciales)
--   24 -> 27 -> 31 (Fundamentos -> Estructura de Datos -> POO)
--   32 -> 38 -> 41 (Protocolos -> Redes Area Local -> Seguridad Redes)

CREATE TABLE IF NOT EXISTS empleo_materias (
  numero            SMALLINT PRIMARY KEY,
  nombre            TEXT NOT NULL,
  creditos          NUMERIC(5,2) NOT NULL DEFAULT 0,
  cuatrimestre_plan SMALLINT,
  seriacion         SMALLINT REFERENCES empleo_materias(numero),
  estado            TEXT NOT NULL DEFAULT 'pendiente', -- aprobada | cursando | pendiente
  ciclo_sugerido    TEXT,                              -- '27-2' | '27-3'
  updated_at        TIMESTAMPTZ DEFAULT now()
);

INSERT INTO empleo_materias (numero, nombre, creditos, cuatrimestre_plan, seriacion, estado, ciclo_sugerido) VALUES
 (1,'Algebra Superior Aplicada',6.5,1,NULL,'aprobada',NULL),
 (2,'Calculo Diferencial',7,1,NULL,'aprobada',NULL),
 (3,'Modelos de Gestion de Negocios',7,1,NULL,'aprobada',NULL),
 (4,'Ciencia y Tecnica con Humanismo',4,1,NULL,'aprobada',NULL),
 (5,'Comunicacion Oral y Escrita',4,1,NULL,'aprobada',NULL),
 (6,'Algebra Lineal Aplicada',6.5,2,1,'aprobada',NULL),
 (7,'Calculo Integral',7,2,2,'aprobada',NULL),
 (8,'Ciudadania y Desarrollo Sustentable',4,2,NULL,'aprobada',NULL),
 (9,'Mecanica para Ingenieria',9.5,2,NULL,'aprobada',NULL),
 (10,'Ingenieria y Tecnologia de Informacion',4,2,NULL,'aprobada',NULL),
 (11,'Probabilidad y Estadistica',6.5,3,NULL,'aprobada',NULL),
 (12,'Calidad y Productividad en Ingenieria',4,3,NULL,'aprobada',NULL),
 (13,'Calculo Vectorial',6.5,3,7,'pendiente','27-2'),
 (14,'Electricidad y Magnetismo',6.5,3,NULL,'aprobada',NULL),
 (15,'Bases de Datos para Ingenieria',6.5,3,10,'aprobada',NULL),
 (16,'Ecuaciones Diferenciales Aplicadas',6.5,4,13,'pendiente','27-3'),
 (17,'Metodos Numericos',6.5,4,7,'pendiente','27-2'),
 (18,'Termodinamica',6.5,4,NULL,'aprobada',NULL),
 (19,'Diseño por Computadora',6.5,4,NULL,'aprobada',NULL),
 (20,'Sistemas de Informacion',6.5,4,NULL,'aprobada',NULL),
 (21,'Matematicas Discretas',6.5,5,NULL,'aprobada',NULL),
 (22,'Ingenieria de Software',6.5,5,NULL,'aprobada',NULL),
 (23,'Circuitos Electricos',6.5,5,NULL,'aprobada',NULL),
 (24,'Fundamentos de Programacion',7,5,NULL,'aprobada',NULL),
 (25,'Analisis y Diseño de Software',6,5,NULL,'aprobada',NULL),
 (26,'Diseño Logico',6,6,NULL,'aprobada',NULL),
 (27,'Estructura de Datos',7,6,24,'pendiente','27-2'),
 (28,'Tecnologias de Informacion',9.9,6,NULL,'aprobada',NULL),
 (29,'Redes de Computadoras',6.5,6,NULL,'aprobada',NULL),
 (30,'Modelos de Bases de Datos',7,6,NULL,'aprobada',NULL),
 (31,'Programacion Orientada a Objetos',7,7,27,'pendiente','27-3'),
 (32,'Protocolos y Enrutamiento de Redes',6.5,7,29,'cursando',NULL),
 (33,'Trazabilidad y Configuracion de Software',6.5,7,NULL,'aprobada',NULL),
 (34,'Sistemas Operativos',6.5,7,NULL,'aprobada',NULL),
 (35,'Gestion de Bases de Datos',6.5,7,30,'cursando',NULL),
 (36,'Arquitectura y Programacion de Computadoras',6.5,8,NULL,'aprobada',NULL),
 (37,'Calidad de la Tecnologia de Informacion',6.5,8,NULL,'aprobada',NULL),
 (38,'Redes de Area Local',6.5,8,32,'pendiente','27-2'),
 (39,'Ingenieria de Requerimientos',6,8,NULL,'aprobada',NULL),
 (40,'Programacion y Gestion de Sistemas Operativos',9.9,8,NULL,'cursando',NULL),
 (41,'Seguridad y Redes de Area Amplia',6.5,9,38,'pendiente','27-3'),
 (42,'Implantacion y Mantenimiento de Sistemas',6.5,9,NULL,'cursando',NULL),
 (43,'Analitica Web',6.5,9,NULL,'cursando',NULL),
 (44,'Administracion de Proyectos de Ingenieria',9.5,9,NULL,'pendiente','27-2'),
 (45,'Aplicaciones Moviles y en la Nube',9.9,10,NULL,'pendiente','27-3'),
 (46,'Emprendimiento e Innovacion en Ingenieria',4,10,NULL,'pendiente','27-2'),
 (47,'Administracion Estrategica de la Tecnologia de Informacion',6.5,10,NULL,'pendiente','27-3'),
 (48,'Seminario de Ingenieria en Sistemas Computacionales',6.5,10,NULL,'pendiente','27-3')
ON CONFLICT (numero) DO NOTHING;

ALTER TABLE empleo_materias DISABLE ROW LEVEL SECURITY;

-- Verificacion: debe dar 31 aprobadas, 5 cursando, 12 pendientes.
SELECT estado, count(*), sum(creditos) AS creditos
FROM empleo_materias GROUP BY estado ORDER BY estado;
