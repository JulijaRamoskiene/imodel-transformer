import { ECDb, ECDbOpenMode, IModelDb } from "@itwin/core-backend";
import { DbResult, Id64, Id64String } from "@itwin/core-bentley";
import { Property, PropertyType, RelationshipClass, SchemaLoader } from "@itwin/ecschema-metadata";
import * as assert from "assert";
import { IModelTransformer } from "./IModelTransformer";

// some high entropy string
const injectionString = "Inject_1243yu1";
const injectExpr = (s: string) => `(SELECT '${injectionString} ${escapeForSqlStr(s)}')`;

const escapeForSqlStr = (s: string) => s.replace(/'/g, "''");
const unescapeSqlStr = (s: string) => s.replace(/''/g, "'");

/** each key is a map of entity class names to its query for that key's type */
interface PolymorphicEntityQueries {
  /** inserts without preserving references, must be updated */
  populate: Map<string, (db: ECDb, jsonString: string) => Id64String>;
  insert: Map<string, (db: ECDb, jsonString: string, source?: { id: Id64String, db: IModelDb }) => Id64String>;
  /** FIXME: rename to hydrate? since it's not an update but hydrating populated rows... */
  update: Map<string, (db: ECDb, jsonString: string, source?: { id: Id64String, db: IModelDb }) => void>;
}

interface PropInfo {
  name: Property["name"];
  propertyType: Property["propertyType"];
  isReadOnly?: Property["isReadOnly"];
}

/**
 * Create a polymorphic insert query for a given db,
 * by expanding its class hiearchy into a giant case statement and using JSON_Extract
 */
async function createPolymorphicEntityQueryMap(db: IModelDb): Promise<PolymorphicEntityQueries> {
  const schemaNamesReader = db.createQueryReader("SELECT Name FROM ECDbMeta.ECSchemaDef", undefined, { usePrimaryConn: true });

  const schemaNames: string[] = [];
  while (await schemaNamesReader.step()) {
    schemaNames.push(schemaNamesReader.current[0]);
  }

  const schemaLoader = new SchemaLoader((name: string) => db.getSchemaProps(name));
  const classFullNameAndProps = new Map<string, PropInfo[]>();

  for (const schemaName of schemaNames) {
    const schema = schemaLoader.getSchema(schemaName);
    for (const ecclass of schema.getClasses()) {
      const classProps: PropInfo[] = [...await ecclass.getProperties()];
      classFullNameAndProps.set(ecclass.fullName, classProps);

      if (ecclass instanceof RelationshipClass) {
        classProps.push({
          name: "SourceECInstanceId",
          propertyType: PropertyType.Long,
        });
        classProps.push({
          name: "TargetECInstanceId",
          propertyType: PropertyType.Long,
        });
      }

      classFullNameAndProps.set(ecclass.fullName, classProps);
    }
  }

  const result: PolymorphicEntityQueries = {
    insert: new Map(),
    populate: new Map(),
    update: new Map(),
  };

  // sqlite cast doesn't understand hexadecimal strings so can't use this
  // FIXME: custom sql function will be wayyyy better than this
  // ? `CAST(JSON_EXTRACT(:x, '$.${p.name}.Id') AS INTEGER)`SELECT
  const readHexFromJson = (p: Pick<PropInfo, "name" | "propertyType">, accessStr?: string) => {
    const navProp = p.propertyType === PropertyType.Navigation;
    return `(
      (instr('123456789abcdef', substr('0000000000000000' || lower(JSON_EXTRACT(:x, '$.${accessStr ?? `${p.name}${navProp ? ".Id" : ""}`}')), -1, 1)) << 0) |
      (instr('123456789abcdef', substr('0000000000000000' || lower(JSON_EXTRACT(:x, '$.${accessStr ?? `${p.name}${navProp ? ".Id" : ""}`}')), -2, 1)) << 4) |
      (instr('123456789abcdef', substr('0000000000000000' || lower(JSON_EXTRACT(:x, '$.${accessStr ?? `${p.name}${navProp ? ".Id" : ""}`}')), -3, 1)) << 8) |
      (instr('123456789abcdef', substr('0000000000000000' || lower(JSON_EXTRACT(:x, '$.${accessStr ?? `${p.name}${navProp ? ".Id" : ""}`}')), -4, 1)) << 12) |
      (instr('123456789abcdef', substr('0000000000000000' || lower(JSON_EXTRACT(:x, '$.${accessStr ?? `${p.name}${navProp ? ".Id" : ""}`}')), -5, 1)) << 16) |
      (instr('123456789abcdef', substr('0000000000000000' || lower(JSON_EXTRACT(:x, '$.${accessStr ?? `${p.name}${navProp ? ".Id" : ""}`}')), -6, 1)) << 20) |
      (instr('123456789abcdef', substr('0000000000000000' || lower(JSON_EXTRACT(:x, '$.${accessStr ?? `${p.name}${navProp ? ".Id" : ""}`}')), -7, 1)) << 24) |
      (instr('123456789abcdef', substr('0000000000000000' || lower(JSON_EXTRACT(:x, '$.${accessStr ?? `${p.name}${navProp ? ".Id" : ""}`}')), -8, 1)) << 28) |
      (instr('123456789abcdef', substr('0000000000000000' || lower(JSON_EXTRACT(:x, '$.${accessStr ?? `${p.name}${navProp ? ".Id" : ""}`}')), -9, 1)) << 32) |
      (instr('123456789abcdef', substr('0000000000000000' || lower(JSON_EXTRACT(:x, '$.${accessStr ?? `${p.name}${navProp ? ".Id" : ""}`}')), -10, 1)) << 36) |
      (instr('123456789abcdef', substr('0000000000000000' || lower(JSON_EXTRACT(:x, '$.${accessStr ?? `${p.name}${navProp ? ".Id" : ""}`}')), -11, 1)) << 40) |
      (instr('123456789abcdef', substr('0000000000000000' || lower(JSON_EXTRACT(:x, '$.${accessStr ?? `${p.name}${navProp ? ".Id" : ""}`}')), -12, 1)) << 44) |
      (instr('123456789abcdef', substr('0000000000000000' || lower(JSON_EXTRACT(:x, '$.${accessStr ?? `${p.name}${navProp ? ".Id" : ""}`}')), -13, 1)) << 48) |
      (instr('123456789abcdef', substr('0000000000000000' || lower(JSON_EXTRACT(:x, '$.${accessStr ?? `${p.name}${navProp ? ".Id" : ""}`}')), -14, 1)) << 52) |
      (instr('123456789abcdef', substr('0000000000000000' || lower(JSON_EXTRACT(:x, '$.${accessStr ?? `${p.name}${navProp ? ".Id" : ""}`}')), -15, 1)) << 56) |
      (instr('123456789abcdef', substr('0000000000000000' || lower(JSON_EXTRACT(:x, '$.${accessStr ?? `${p.name}${navProp ? ".Id" : ""}`}')), -16, 1)) << 60)
    )`;
  };

  for (const [classFullName, properties] of classFullNameAndProps) {
    /* eslint-disable @typescript-eslint/indent */
    const updateProps = properties
      .filter((p) => !p.isReadOnly
        && p.propertyType === PropertyType.Navigation
        || p.name === "CodeValue");

    const updateQuery = updateProps.length === 0 ? "" : `
      UPDATE ${classFullName}
      SET ${
        updateProps
          .map((p) =>
            // FIXME: use ECReferenceCache to get type of ref instead of checking name
            p.propertyType === PropertyType.Navigation && p.name === "CodeSpec"
            ? `${p.name}.Id = ${injectExpr(`(
              SELECT TargetId
              FROM temp.codespec_remap
              WHERE SourceId=${readHexFromJson(p)}
            )`)}`
            : p.propertyType === PropertyType.Navigation
            ? `${p.name}.Id = ${injectExpr(`(
              SELECT TargetId
              FROM temp.element_remap
              WHERE SourceId=${readHexFromJson(p)}
            )`)}`
            // FIXME: use ecreferencetypes cache to determine which remap table to use
            : p.propertyType === PropertyType.Long
            ? `${p.name} = ${injectExpr(`(
              SELECT TargetId
              FROM temp.element_remap
              WHERE SourceId=${readHexFromJson(p)}
            )`)}`
            // is CodeValue if not nav prop
            : `${p.name} = JSON_EXTRACT(:x, '$.CodeValue')`
          )
          .join(",\n  ")
      }
      WHERE ECInstanceId=${injectExpr(`(
        SELECT TargetId
        FROM temp.element_remap
        WHERE SourceId=${readHexFromJson({ name: "ECInstanceId", propertyType: PropertyType.Long })}
      )`)}
    `;

    const populateQuery = `
      INSERT INTO ${classFullName}
      (${properties
        .map((p) =>
          // FIXME: note that dynamic structs are completely unhandled
          p.propertyType === PropertyType.Navigation
          ? `${p.name}.Id`
          : p.propertyType === PropertyType.Point2d
          ? `${p.name}.x, ${p.name}.y`
          : p.propertyType === PropertyType.Point3d
          ? `${p.name}.x, ${p.name}.y, ${p.name}.z`
          // : p.type === PropertyType.DateTime
          // ? `${p.name}.Id`
          : p.name
        )
        .join(",\n  ")
      })
      VALUES
      (${properties
        .map((p) =>
          // FIXME: check for exact schema of CodeValue prop
          p.name === "CodeValue"
          ? "NULL"
          : p.propertyType === PropertyType.Navigation || p.propertyType === PropertyType.Long
          ? "0x1"
          : p.propertyType === PropertyType.Point2d
          ? `JSON_EXTRACT(:x, '$.${p.name}.x'), JSON_EXTRACT(:x, '$.${p.name}.y')`
          : p.propertyType === PropertyType.Point3d
          ? `JSON_EXTRACT(:x, '$.${p.name}.x'), JSON_EXTRACT(:x, '$.${p.name}.y'), JSON_EXTRACT(:x, '$.${p.name}.z')`
          : `JSON_EXTRACT(:x, '$.${p.name}')`
        )
        .join(",\n  ")
      })
    `;

    const insertQuery = `
      INSERT INTO ${classFullName}
      -- FIXME: getting SQLITE_MISMATCH... something weird going on in native
      (
        ${
          [
            { name: "ECInstanceId", propertyType: PropertyType.Long },
            ...properties,
          ].map((p) =>
          // FIXME: note that dynamic structs are completely unhandled
          p.propertyType === PropertyType.Navigation
          ? `${p.name}.Id, ${p.name}.RelECClassId`
          : p.propertyType === PropertyType.Point2d
          ? `${p.name}.x, ${p.name}.y`
          : p.propertyType === PropertyType.Point3d
          ? `${p.name}.x, ${p.name}.y, ${p.name}.z`
          : p.name
        )
        .join(",\n  ")
      })
      VALUES (
      ${injectExpr(`(
        -- FIXME: don't I need to increment this?
        SELECT Val + 1
        FROM be_Local
        WHERE Name='bis_instanceidsequence'
      )`)}
      ${properties.length > 0 ? "," : "" /* FIXME: join instead */}
      ${properties
        .map((p) =>
          p.propertyType === PropertyType.Navigation
          // FIXME: need to use ECReferenceCache to get type of reference, might not be an elem
          ? `${injectExpr(`(
              SELECT TargetId
              FROM temp.element_remap
              WHERE SourceId=${readHexFromJson(p)}
            )`)}, ${injectExpr(`(
              SELECT tc.Id
              FROM source.ec_Class sc
              JOIN source.ec_Schema ss ON ss.Id=sc.SchemaId
              JOIN main.ec_Schema ts ON ts.Name=ss.Name
              JOIN main.ec_Class tc ON tc.Name=sc.Name
              WHERE sc.Id=${readHexFromJson(p, `${p.name}.RelECClassId`)}
            )`)}`
          // FIXME: use ecreferencetypes cache to determine which remap table to use
          : p.propertyType === PropertyType.Long
          ? injectExpr(`(
            SELECT TargetId
            FROM temp.element_remap
            WHERE SourceId=${readHexFromJson(p)}
          )`)
          : p.propertyType === PropertyType.Point2d
          ? `JSON_EXTRACT(:x, '$.${p.name}.x'), JSON_EXTRACT(:x, '$.${p.name}.y')`
          : p.propertyType === PropertyType.Point3d
          ? `JSON_EXTRACT(:x, '$.${p.name}.x'), JSON_EXTRACT(:x, '$.${p.name}.y'), JSON_EXTRACT(:x, '$.${p.name}.z')`
          : `JSON_EXTRACT(:x, '$.${p.name}')`
        )
        .join(",\n  ")
      })
    `;
    /* eslint-enable @typescript-eslint/indent */

    /* eslint-enable @typescript-eslint/indent */

    function populate(ecdb: ECDb, jsonString: string) {
      try {
        return ecdb.withPreparedStatement(populateQuery, (targetStmt) => {
          targetStmt.bindString("x", jsonString);
          const stepRes = targetStmt.stepForInsert();
          assert(stepRes.status === DbResult.BE_SQLITE_DONE && stepRes.id);
          return stepRes.id;
        });
      } catch (err) {
        //console.log("SOURCE", source?.db.withStatement(`SELECT * FROM ${classFullName} WHERE ECInstanceId=${source.id}`, s=>[...s]));
        console.log("ERROR", ecdb.nativeDb.getLastError());
        console.log("json:", JSON.stringify(JSON.parse(jsonString), undefined, " "));
        console.log("ecsql:", populateQuery);
        throw err;
      }
    }

    function insert(ecdb: ECDb, jsonString: string, source?: { id: string, db: IModelDb }) {
      // NEXT FIXME: doesn't work on some relationships, need to explicitly know if it's a rel
      // class and then always add source/target to INSERT
      let hackedRemapInsertSql;
      try {
        // HACK: create hybrid sqlite/ecsql query
        hackedRemapInsertSql = ecdb.withPreparedStatement(insertQuery, (targetStmt) => {
          const nativeSql = targetStmt.getNativeSql();
          return nativeSql.replace(
            new RegExp(`\\(SELECT '${injectionString} (.*?[^']('')*)'\\)`, "gs"),
            (_, p1) => unescapeSqlStr(p1),
          );
        });

        ecdb.withPreparedSqliteStatement(hackedRemapInsertSql, (targetStmt) => {
          // can't use named bindings in raw sqlite statement apparently
          targetStmt.bindString(1, jsonString);
          assert(targetStmt.step() === DbResult.BE_SQLITE_DONE);
        });

        // FIXME: get id better?
        return ecdb.withPreparedSqliteStatement(`
          SELECT Val
          FROM be_Local
          WHERE Name='bis_elementidsequence'
        `, (s) => {
          assert(s.step() === DbResult.BE_SQLITE_ROW);
          return s.getValue(0).getId();
        });
      } catch (err) {
        console.log("SOURCE", source?.db.withStatement(`SELECT * FROM ${classFullName} WHERE ECInstanceId=${source.id}`, s=>[...s]));
        console.log("ERROR", ecdb.nativeDb.getLastError());
        console.log("transformed:", JSON.stringify(JSON.parse(jsonString), undefined, " "));
        console.log("ecsql:", insertQuery);
        console.log("native sql:", hackedRemapInsertSql);
        throw err;
      }
    }

    function update(ecdb: ECDb, jsonString: string, source?: { id: string, db: IModelDb }) {
      // HACK: create hybrid sqlite/ecsql query
      if (updateQuery === "") return; // ignore empty updates

      const hackedRemapUpdateSql = ecdb.withPreparedStatement(updateQuery, (targetStmt) => {
        const nativeSql = targetStmt.getNativeSql();
        return nativeSql.replace(
          new RegExp(`\\(SELECT '${injectionString} (.*?[^']('')*)'\\)`, "gs"),
          (_, p1) => unescapeSqlStr(p1),
        );
      });

      try {
        ecdb.withPreparedSqliteStatement(hackedRemapUpdateSql, (targetStmt) => {
          // can't use named bindings in raw sqlite statement apparently
          targetStmt.bindString(1, jsonString);
          assert(targetStmt.step() === DbResult.BE_SQLITE_DONE);
        });
      } catch (err) {
        console.log("SOURCE", source?.db.withStatement(`SELECT * FROM ${classFullName} WHERE ECInstanceId=${source.id}`, s=>[...s]));
        console.log("ERROR", ecdb.nativeDb.getLastError());
        console.log("transformed:", JSON.stringify(JSON.parse(jsonString), undefined, " "));
        console.log("native sql:", hackedRemapUpdateSql);
        throw err;
      }
    }

    result.insert.set(classFullName, insert);
    result.populate.set(classFullName, populate);
    result.update.set(classFullName, update);
  }

  return result;
}

// FIXME: consolidate with assertIdentityTransform test, and maybe hide this return type
export interface Remapper {
  findTargetElementId(s: Id64String): Id64String;
  findTargetCodeSpecId(s: Id64String): Id64String;
  findTargetAspectId(s: Id64String): Id64String;
}

/** @alpha FIXME: official docs */
export async function rawEmulatedPolymorphicInsertTransform(source: IModelDb, target: IModelDb, options?: {
  returnRemapper?: false;
}): Promise<undefined>;
/** @internal */
export async function rawEmulatedPolymorphicInsertTransform(source: IModelDb, target: IModelDb, options?: {
  returnRemapper: true;
}): Promise<Remapper>;
export async function rawEmulatedPolymorphicInsertTransform(source: IModelDb, target: IModelDb, {
  returnRemapper = false,
} = {}): Promise<undefined | Remapper> {
  const schemaExporter = new IModelTransformer(source, target);
  await schemaExporter.processSchemas();
  schemaExporter.dispose();

  // like insert but doesn't do references
  // FIXME: return all three queries instead of loading schemas
  const queryMap = await createPolymorphicEntityQueryMap(target);

  source.withPreparedStatement("PRAGMA experimental_features_enabled = true", (s) => assert(s.step() !== DbResult.BE_SQLITE_ERROR));

  const writeableTarget = new ECDb();
  writeableTarget.openDb(target.pathName, ECDbOpenMode.ReadWrite);
  target.close();

  for (const type of ["element", "codespec", "aspect"]) {
    writeableTarget.withSqliteStatement(`
      CREATE TEMP TABLE temp.${type}_remap(
        SourceId INTEGER NOT NULL PRIMARY KEY, -- do we need an index?
        TargetId INTEGER NOT NULL
      )
    `, (s) => assert(s.step() === DbResult.BE_SQLITE_DONE));
  }

  writeableTarget.withSqliteStatement(`
    ATTACH DATABASE 'file://${source.pathName}?mode=ro' AS source
  `, (s) => assert(s.step() === DbResult.BE_SQLITE_DONE));

  writeableTarget.withPreparedSqliteStatement(`
    INSERT INTO temp.element_remap VALUES(0x1,0x1), (0xe,0xe), (0x10, 0x10)
  `, (targetStmt) => {
    assert(targetStmt.step() === DbResult.BE_SQLITE_DONE);
  });

  // FIXME: this doesn't work... using a workaround of setting all references to 0x1
  writeableTarget.withPreparedSqliteStatement(`
    PRAGMA defer_foreign_keys_pragma = true;
  `, (s) => assert(s.step() === DbResult.BE_SQLITE_DONE));

  // FIXME: reinstate triggers after by caching them from sqlite_master
  const triggers = writeableTarget.withPreparedSqliteStatement(`
    SELECT name, sql FROM sqlite_master
    WHERE type='trigger'
  `, (s) => {
    const result = new Map<string, string>();
    while(s.step() === DbResult.BE_SQLITE_ROW) {
      const triggerName = s.getValue(0).getString();
      const sql = s.getValue(1).getString();
      result.set(triggerName, sql);
    }
    return result;
  });

  for (const [trigger] of triggers) {
    writeableTarget.withSqliteStatement(`
      DROP TRIGGER ${trigger}
    `, (s) => assert(s.step() === DbResult.BE_SQLITE_DONE));
  }

  // transform code specs
  const sourceCodeSpecSelect = `
    SELECT s.Id, t.Id, s.Name, s.JsonProperties
    FROM source.bis_CodeSpec s
    LEFT JOIN main.bis_CodeSpec t ON s.Name=t.Name
  `;

  writeableTarget.withSqliteStatement(sourceCodeSpecSelect, (stmt) => {
    while (stmt.step() === DbResult.BE_SQLITE_ROW) {
      const sourceId = stmt.getValue(0).getId();
      let targetId = stmt.getValue(1).getId();
      const name = stmt.getValue(2).getString();
      const jsonProps = stmt.getValue(3).getString();

      if (!targetId) {
        targetId = writeableTarget.withPreparedStatement(`
          INSERT INTO bis.CodeSpec VALUES(?,?)
        `, (targetStmt) => {
          targetStmt.bindString(1, name);
          targetStmt.bindString(2, jsonProps);
          const result = targetStmt.stepForInsert();
          if (result.status !== DbResult.BE_SQLITE_DONE || !result.id) {
            const err = new Error(`Expected BE_SQLITE_DONE but got ${result.status}`);
            (err as any).result = result;
            throw err;
          }
          return result.id;
        }, false);
      }

      writeableTarget.withPreparedSqliteStatement(`
        INSERT INTO temp.codespec_remap VALUES(?,?)
      `, (targetStmt) => {
        targetStmt.bindId(1, sourceId);
        targetStmt.bindId(2, targetId);
        assert(targetStmt.step() === DbResult.BE_SQLITE_DONE);
      });
    }
  });

  const sourceElemSelect = `
    SELECT $, ec_classname(ECClassId, 's.c'), ECInstanceId
    FROM bis.Element
    WHERE ECInstanceId NOT IN (0x1, 0xe, 0x10) 
    -- FIXME: would be much faster to temporarily disable FK constraints
    -- FIXME: ordering by class *might* be faster due to less cache busting
    -- ORDER BY ECClassId, ECInstanceId ASC
    ORDER BY ECInstanceId ASC
  `;

  // first pass, update everything with trivial references (0x1 and null codes)
  const sourceElemFirstPassReader = source.createQueryReader(sourceElemSelect, undefined, { usePrimaryConn: true });
  while (await sourceElemFirstPassReader.step()) {
    const jsonString = sourceElemFirstPassReader.current[0];
    const classFullName = sourceElemFirstPassReader.current[1];
    const sourceId = sourceElemFirstPassReader.current[2];

    const populateQuery = queryMap.populate.get(classFullName);
    assert(populateQuery, `couldn't find insert query for class '${classFullName}'`);

    const targetId = populateQuery(writeableTarget, jsonString);

    writeableTarget.withPreparedSqliteStatement(`
      INSERT INTO temp.element_remap VALUES(?,?)
    `, (targetStmt) => {
      targetStmt.bindId(1, sourceId);
      targetStmt.bindId(2, targetId);
      assert(targetStmt.step() === DbResult.BE_SQLITE_DONE);
    });
  }

  // second pass, update now that everything has been inserted
  const sourceElemSecondPassReader = source.createQueryReader(sourceElemSelect, undefined, { usePrimaryConn: true });
  while (await sourceElemSecondPassReader.step()) {
    const jsonString = sourceElemSecondPassReader.current[0];
    const classFullName = sourceElemSecondPassReader.current[1];
    const sourceId = sourceElemSecondPassReader.current[2];

    const updateQuery = queryMap.update.get(classFullName);
    assert(updateQuery, `couldn't find update query for class '${classFullName}`);

    updateQuery(writeableTarget, jsonString, { id: sourceId, db: source });
  }

  const sourceAspectSelect = `
    SELECT $, ec_classname(ECClassId, 's.c'), ECInstanceId
    FROM bis.ElementAspect
  `;

  const aspectReader = source.createQueryReader(sourceAspectSelect, undefined, { usePrimaryConn: true });
  while (await aspectReader.step()) {
    const jsonString = aspectReader.current[0];
    const classFullName = aspectReader.current[1];
    const sourceId = aspectReader.current[2];

    const insertQuery = queryMap.insert.get(classFullName);
    assert(insertQuery, `couldn't find insert query for class '${classFullName}`);

    const targetId = insertQuery(writeableTarget, jsonString, { id: sourceId, db: source });

    writeableTarget.withPreparedSqliteStatement(`
      INSERT INTO temp.aspect_remap VALUES(?,?)
    `, (targetStmt) => {
      targetStmt.bindId(1, sourceId);
      targetStmt.bindId(2, targetId);
      assert(targetStmt.step() === DbResult.BE_SQLITE_DONE);
    });
  }

  const elemRefersSelect = `
    SELECT $, ec_classname(ECClassId, 's.c'), ECInstanceId
    FROM bis.ElementRefersToElements
  `;

  const elemRefersReader = source.createQueryReader(elemRefersSelect, undefined, { usePrimaryConn: true });
  while (await elemRefersReader.step()) {
    const jsonString = elemRefersReader.current[0];
    const classFullName = elemRefersReader.current[1];
    const sourceId = elemRefersReader.current[2];

    const insertQuery = queryMap.insert.get(classFullName);
    assert(insertQuery, `couldn't find insert query for class '${classFullName}`);

    console.log(sourceId, classFullName, jsonString);

    insertQuery(writeableTarget, jsonString, { id: sourceId, db: source });
  }

  // FIXME: also do ElementDrivesElements

  writeableTarget.withPreparedSqliteStatement(`
    PRAGMA defer_foreign_keys_pragma = false;
  `, (s) => assert(s.step() === DbResult.BE_SQLITE_DONE));

  // FIXME: this is a hack! need to recalculate entire spatial index after this... probably better
  // to just modify the native end to allow writes?
  for (const [, triggerSql] of triggers) {
    writeableTarget.withSqliteStatement(triggerSql, (s) => assert(s.step() === DbResult.BE_SQLITE_DONE));
  }

  // TODO: make collecting/returning this optional
  let remapper: Remapper | undefined;

  if (returnRemapper) {
    const [elemRemaps, codeSpecRemaps, aspectRemaps] = ["codespec", "element", "aspect"].map((type) => {
      const remaps = new Map<string, string>();

      writeableTarget.withSqliteStatement(
        `SELECT format('0x%x', SourceId), format('0x%x', TargetId) FROM temp.${type}_remap`,
        (s) => {
          while (s.step() === DbResult.BE_SQLITE_ROW) {
            remaps.set(s.getValue(0).getString(), s.getValue(1).getString());
          }
        }
      );

      return remaps;
    });

    remapper = {
      findTargetElementId: (id: Id64String) => elemRemaps.get(id) ?? Id64.invalid,
      findTargetAspectId: (id: Id64String) => aspectRemaps.get(id) ?? Id64.invalid,
      findTargetCodeSpecId: (id: Id64String) => codeSpecRemaps.get(id) ?? Id64.invalid,
    };
  }

  writeableTarget.clearStatementCache(); // so we can detach attached db

  // FIXME: detach... readonly attached db gets write-locked for some reason
  // writeableTarget.withSqliteStatement(`
  //   DETACH source
  // `, (s) => assert(s.step() === DbResult.BE_SQLITE_DONE));

  writeableTarget.saveChanges();
  writeableTarget.closeDb();
  writeableTarget.dispose();

  return remapper;
}
