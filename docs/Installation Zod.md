## **Installation**

### **Requirements**

* TypeScript 4.5+\!

You must enable `strict` mode in your `tsconfig.json`. This is a best practice for all TypeScript projects.  
// tsconfig.json  
{  
  // ...  
  "compilerOptions": {  
    // ...  
    "strict": true  
  }

* }

### **From `npm`**

npm install zod       \# npm  
deno add npm:zod      \# deno  
yarn add zod          \# yarn  
bun add zod           \# bun  
pnpm add zod          \# pnpm

Zod also publishes a canary version on every commit. To install the canary:

npm install zod@canary       \# npm  
deno add npm:zod@canary      \# deno  
yarn add zod@canary          \# yarn  
bun add zod@canary           \# bun  
pnpm add zod@canary          \# pnpm

The rest of this README assumes you are using npm and importing directly from the `"zod"` package.

## **Basic usage**

Creating a simple string schema

import { z } from "zod";

// creating a schema for strings  
const mySchema \= z.string();

// parsing  
mySchema.parse("tuna"); // \=\> "tuna"  
mySchema.parse(12); // \=\> throws ZodError

// "safe" parsing (doesn't throw error if validation fails)  
mySchema.safeParse("tuna"); // \=\> { success: true; data: "tuna" }  
mySchema.safeParse(12); // \=\> { success: false; error: ZodError }

Creating an object schema

import { z } from "zod";

const User \= z.object({  
  username: z.string(),  
});

User.parse({ username: "Ludwig" });

// extract the inferred type  
type User \= z.infer\<typeof User\>;  
// { username: string }

## **Primitives**

import { z } from "zod";

// primitive values  
z.string();  
z.number();  
z.bigint();  
z.boolean();  
z.date();  
z.symbol();

// empty types  
z.undefined();  
z.null();  
z.void(); // accepts undefined

// catch-all types  
// allows any value  
z.any();  
z.unknown();

// never type  
// allows no values  
z.never();

## **Coercion for primitives**

Zod now provides a more convenient way to coerce primitive values.

const schema \= z.coerce.string();  
schema.parse("tuna"); // \=\> "tuna"  
schema.parse(12); // \=\> "12"

During the parsing step, the input is passed through the `String()` function, which is a JavaScript built-in for coercing data into strings.

schema.parse(12); // \=\> "12"  
schema.parse(true); // \=\> "true"  
schema.parse(undefined); // \=\> "undefined"  
schema.parse(null); // \=\> "null"

The returned schema is a normal `ZodString` instance so you can use all string methods.

z.coerce.string().email().min(5);

How coercion works

All primitive types support coercion. Zod coerces all inputs using the built-in constructors: `String(input)`, `Number(input)`, `new Date(input)`, etc.

z.coerce.string(); // String(input)  
z.coerce.number(); // Number(input)  
z.coerce.boolean(); // Boolean(input)  
z.coerce.bigint(); // BigInt(input)  
z.coerce.date(); // new Date(input)

Note — Boolean coercion with `z.coerce.boolean()` may not work how you expect. Any [truthy](https://developer.mozilla.org/en-US/docs/Glossary/Truthy) value is coerced to `true`, and any [falsy](https://developer.mozilla.org/en-US/docs/Glossary/Falsy) value is coerced to `false`.

const schema \= z.coerce.boolean(); // Boolean(input)

schema.parse("tuna"); // \=\> true  
schema.parse("true"); // \=\> true  
schema.parse("false"); // \=\> true  
schema.parse(1); // \=\> true  
schema.parse(\[\]); // \=\> true

schema.parse(0); // \=\> false  
schema.parse(""); // \=\> false  
schema.parse(undefined); // \=\> false  
schema.parse(null); // \=\> false

For more control over coercion logic, consider using [`z.preprocess`](https://www.npmjs.com/package/zod#preprocess) or [`z.pipe()`](https://www.npmjs.com/package/zod#pipe).

## **Literals**

Literal schemas represent a [literal type](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#literal-types), like `"hello world"` or `5`.

const tuna \= z.literal("tuna");  
const twelve \= z.literal(12);  
const twobig \= z.literal(2n); // bigint literal  
const tru \= z.literal(true);

const terrificSymbol \= Symbol("terrific");  
const terrific \= z.literal(terrificSymbol);

// retrieve literal value  
tuna.value; // "tuna"

Currently there is no support for Date literals in Zod. If you have a use case for this feature, please file an issue.

## **Strings**

Zod includes a handful of string-specific validations.

// validations  
z.string().max(5);  
z.string().min(5);  
z.string().length(5);  
z.string().email();  
z.string().url();  
z.string().emoji();  
z.string().uuid();  
z.string().nanoid();  
z.string().cuid();  
z.string().cuid2();  
z.string().ulid();  
z.string().regex(regex);  
z.string().includes(string);  
z.string().startsWith(string);  
z.string().endsWith(string);  
z.string().datetime(); // ISO 8601; by default only \`Z\` timezone allowed  
z.string().ip(); // defaults to allow both IPv4 and IPv6  
z.string().cidr(); // defaults to allow both IPv4 and IPv6

// transforms  
z.string().trim(); // trim whitespace  
z.string().toLowerCase(); // toLowerCase  
z.string().toUpperCase(); // toUpperCase

// added in Zod 3.23  
z.string().date(); // ISO date format (YYYY-MM-DD)  
z.string().time(); // ISO time format (HH:mm:ss\[.SSSSSS\])  
z.string().duration(); // ISO 8601 duration  
z.string().base64();

Check out [validator.js](https://github.com/validatorjs/validator.js) for a bunch of other useful string validation functions that can be used in conjunction with [Refinements](https://www.npmjs.com/package/zod#refine).

You can customize some common error messages when creating a string schema.

const name \= z.string({  
  required\_error: "Name is required",  
  invalid\_type\_error: "Name must be a string",  
});

When using validation methods, you can pass in an additional argument to provide a custom error message.

z.string().min(5, { message: "Must be 5 or more characters long" });  
z.string().max(5, { message: "Must be 5 or fewer characters long" });  
z.string().length(5, { message: "Must be exactly 5 characters long" });  
z.string().email({ message: "Invalid email address" });  
z.string().url({ message: "Invalid url" });  
z.string().emoji({ message: "Contains non-emoji characters" });  
z.string().uuid({ message: "Invalid UUID" });  
z.string().includes("tuna", { message: "Must include tuna" });  
z.string().startsWith("https://", { message: "Must provide secure URL" });  
z.string().endsWith(".com", { message: "Only .com domains allowed" });  
z.string().datetime({ message: "Invalid datetime string\! Must be UTC." });  
z.string().date({ message: "Invalid date string\!" });  
z.string().time({ message: "Invalid time string\!" });  
z.string().ip({ message: "Invalid IP address" });  
z.string().cidr({ message: "Invalid CIDR" });

### **Datetimes**

As you may have noticed, Zod string includes a few date/time related validations. These validations are regular expression based, so they are not as strict as a full date/time library. However, they are very convenient for validating user input.

The `z.string().datetime()` method enforces ISO 8601; default is no timezone offsets and arbitrary sub-second decimal precision.

const datetime \= z.string().datetime();

datetime.parse("2020-01-01T00:00:00Z"); // pass  
datetime.parse("2020-01-01T00:00:00.123Z"); // pass  
datetime.parse("2020-01-01T00:00:00.123456Z"); // pass (arbitrary precision)  
datetime.parse("2020-01-01T00:00:00+02:00"); // fail (no offsets allowed)

Timezone offsets can be allowed by setting the `offset` option to `true`.

const datetime \= z.string().datetime({ offset: true });

datetime.parse("2020-01-01T00:00:00+02:00"); // pass  
datetime.parse("2020-01-01T00:00:00.123+02:00"); // pass (millis optional)  
datetime.parse("2020-01-01T00:00:00.123+0200"); // pass (millis optional)  
datetime.parse("2020-01-01T00:00:00.123+02"); // pass (only offset hours)  
datetime.parse("2020-01-01T00:00:00Z"); // pass (Z still supported)

Allow unqualified (timezone-less) datetimes with the `local` flag.

const schema \= z.string().datetime({ local: true });  
schema.parse("2020-01-01T00:00:00"); // pass

You can additionally constrain the allowable `precision`. By default, arbitrary sub-second precision is supported (but optional).

const datetime \= z.string().datetime({ precision: 3 });

datetime.parse("2020-01-01T00:00:00.123Z"); // pass  
datetime.parse("2020-01-01T00:00:00Z"); // fail  
datetime.parse("2020-01-01T00:00:00.123456Z"); // fail

### **Dates**

Added in Zod 3.23

The `z.string().date()` method validates strings in the format `YYYY-MM-DD`.

const date \= z.string().date();

date.parse("2020-01-01"); // pass  
date.parse("2020-1-1"); // fail  
date.parse("2020-01-32"); // fail

### **Times**

Added in Zod 3.23

The `z.string().time()` method validates strings in the format `HH:MM:SS[.s+]`. The second can include arbitrary decimal precision. It does not allow timezone offsets of any kind.

const time \= z.string().time();

time.parse("00:00:00"); // pass  
time.parse("09:52:31"); // pass  
time.parse("23:59:59.9999999"); // pass (arbitrary precision)

time.parse("00:00:00.123Z"); // fail (no \`Z\` allowed)  
time.parse("00:00:00.123+02:00"); // fail (no offsets allowed)

You can set the `precision` option to constrain the allowable decimal precision.

const time \= z.string().time({ precision: 3 });

time.parse("00:00:00.123"); // pass  
time.parse("00:00:00.123456"); // fail  
time.parse("00:00:00"); // fail

### **IP addresses**

By default `.ip()` allows both IPv4 and IPv6.

const ip \= z.string().ip();

ip.parse("192.168.1.1"); // pass  
ip.parse("84d5:51a0:9114:1855:4cfa:f2d7:1f12:7003"); // pass  
ip.parse("84d5:51a0:9114:1855:4cfa:f2d7:1f12:192.168.1.1"); // pass

ip.parse("256.1.1.1"); // fail  
ip.parse("84d5:51a0:9114:gggg:4cfa:f2d7:1f12:7003"); // fail

You can additionally set the IP `version`.

const ipv4 \= z.string().ip({ version: "v4" });  
ipv4.parse("84d5:51a0:9114:1855:4cfa:f2d7:1f12:7003"); // fail

const ipv6 \= z.string().ip({ version: "v6" });  
ipv6.parse("192.168.1.1"); // fail

### **IP ranges (CIDR)**

Validate IP address ranges specified with [CIDR notation](https://en.wikipedia.org/wiki/Classless_Inter-Domain_Routing). By default, `.cidr()` allows both IPv4 and IPv6.

const cidr \= z.string().cidr();  
cidr.parse("192.168.0.0/24"); // pass  
cidr.parse("2001:db8::/32"); // pass

You can specify a version with the `version` parameter.

const ipv4Cidr \= z.string().cidr({ version: "v4" });  
ipv4Cidr.parse("84d5:51a0:9114:1855:4cfa:f2d7:1f12:7003"); // fail

const ipv6Cidr \= z.string().cidr({ version: "v6" });  
ipv6Cidr.parse("192.168.1.1"); // fail

## **Numbers**

You can customize certain error messages when creating a number schema.

const age \= z.number({  
  required\_error: "Age is required",  
  invalid\_type\_error: "Age must be a number",  
});

Zod includes a handful of number-specific validations.

z.number().gt(5);  
z.number().gte(5); // alias .min(5)  
z.number().lt(5);  
z.number().lte(5); // alias .max(5)

z.number().int(); // value must be an integer

z.number().positive(); //     \> 0  
z.number().nonnegative(); //  \>= 0  
z.number().negative(); //     \< 0  
z.number().nonpositive(); //  \<= 0

z.number().multipleOf(5); // Evenly divisible by 5\. Alias .step(5)

z.number().finite(); // value must be finite, not Infinity or \-Infinity  
z.number().safe(); // value must be between Number.MIN\_SAFE\_INTEGER and Number.MAX\_SAFE\_INTEGER

Optionally, you can pass in a second argument to provide a custom error message.

z.number().lte(5, { message: "this👏is👏too👏big" });

## **BigInts**

Zod includes a handful of bigint-specific validations.

z.bigint().gt(5n);  
z.bigint().gte(5n); // alias \`.min(5n)\`  
z.bigint().lt(5n);  
z.bigint().lte(5n); // alias \`.max(5n)\`

z.bigint().positive(); // \> 0n  
z.bigint().nonnegative(); // \>= 0n  
z.bigint().negative(); // \< 0n  
z.bigint().nonpositive(); // \<= 0n

z.bigint().multipleOf(5n); // Evenly divisible by 5n.

## **NaNs**

You can customize certain error messages when creating a nan schema.

const isNaN \= z.nan({  
  required\_error: "isNaN is required",  
  invalid\_type\_error: "isNaN must be 'not a number'",  
});

## **Booleans**

You can customize certain error messages when creating a boolean schema.

const isActive \= z.boolean({  
  required\_error: "isActive is required",  
  invalid\_type\_error: "isActive must be a boolean",  
});

## **Dates**

Use z.date() to validate `Date` instances.

z.date().safeParse(new Date()); // success: true  
z.date().safeParse("2022-01-12T00:00:00.000Z"); // success: false

You can customize certain error messages when creating a date schema.

const myDateSchema \= z.date({  
  required\_error: "Please select a date and time",  
  invalid\_type\_error: "That's not a date\!",  
});

Zod provides a handful of date-specific validations.

z.date().min(new Date("1900-01-01"), { message: "Too old" });  
z.date().max(new Date(), { message: "Too young\!" });

Coercion to Date

Since [zod 3.20](https://github.com/colinhacks/zod/releases/tag/v3.20), use [`z.coerce.date()`](https://www.npmjs.com/package/zod#coercion-for-primitives) to pass the input through `new Date(input)`.

const dateSchema \= z.coerce.date();  
type DateSchema \= z.infer\<typeof dateSchema\>;  
// type DateSchema \= Date

/\* valid dates \*/  
console.log(dateSchema.safeParse("2023-01-10T00:00:00.000Z").success); // true  
console.log(dateSchema.safeParse("2023-01-10").success); // true  
console.log(dateSchema.safeParse("1/10/23").success); // true  
console.log(dateSchema.safeParse(new Date("1/10/23")).success); // true

/\* invalid dates \*/  
console.log(dateSchema.safeParse("2023-13-10").success); // false  
console.log(dateSchema.safeParse("0000-00-00").success); // false

For older zod versions, use [`z.preprocess`](https://www.npmjs.com/package/zod#preprocess) like [described in this thread](https://github.com/colinhacks/zod/discussions/879#discussioncomment-2036276).

## **Zod enums**

const FishEnum \= z.enum(\["Salmon", "Tuna", "Trout"\]);  
type FishEnum \= z.infer\<typeof FishEnum\>;  
// 'Salmon' | 'Tuna' | 'Trout'

`z.enum` is a Zod-native way to declare a schema with a fixed set of allowable *string* values. Pass the array of values directly into `z.enum()`. Alternatively, use `as const` to define your enum values as a tuple of strings. See the [const assertion docs](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-4.html#const-assertions) for details.

const VALUES \= \["Salmon", "Tuna", "Trout"\] as const;  
const FishEnum \= z.enum(VALUES);

This is not allowed, since Zod isn't able to infer the exact values of each element.

const fish \= \["Salmon", "Tuna", "Trout"\];  
const FishEnum \= z.enum(fish);

`.enum`

To get autocompletion with a Zod enum, use the `.enum` property of your schema:

FishEnum.enum.Salmon; // \=\> autocompletes

FishEnum.enum;  
/\*  
\=\> {  
  Salmon: "Salmon",  
  Tuna: "Tuna",  
  Trout: "Trout",  
}  
\*/

You can also retrieve the list of options as a tuple with the `.options` property:

FishEnum.options; // \["Salmon", "Tuna", "Trout"\];

`.exclude/.extract()`

You can create subsets of a Zod enum with the `.exclude` and `.extract` methods.

const FishEnum \= z.enum(\["Salmon", "Tuna", "Trout"\]);  
const SalmonAndTrout \= FishEnum.extract(\["Salmon", "Trout"\]);  
const TunaOnly \= FishEnum.exclude(\["Salmon", "Trout"\]);

## **Native enums**

Zod enums are the recommended approach to defining and validating enums. But if you need to validate against an enum from a third-party library (or you don't want to rewrite your existing enums) you can use `z.nativeEnum()`.

Numeric enums

enum Fruits {  
  Apple,  
  Banana,  
}

const FruitEnum \= z.nativeEnum(Fruits);  
type FruitEnum \= z.infer\<typeof FruitEnum\>; // Fruits

FruitEnum.parse(Fruits.Apple); // passes  
FruitEnum.parse(Fruits.Banana); // passes  
FruitEnum.parse(0); // passes  
FruitEnum.parse(1); // passes  
FruitEnum.parse(3); // fails

String enums

enum Fruits {  
  Apple \= "apple",  
  Banana \= "banana",  
  Cantaloupe, // you can mix numerical and string enums  
}

const FruitEnum \= z.nativeEnum(Fruits);  
type FruitEnum \= z.infer\<typeof FruitEnum\>; // Fruits

FruitEnum.parse(Fruits.Apple); // passes  
FruitEnum.parse(Fruits.Cantaloupe); // passes  
FruitEnum.parse("apple"); // passes  
FruitEnum.parse("banana"); // passes  
FruitEnum.parse(0); // passes  
FruitEnum.parse("Cantaloupe"); // fails

Const enums

The `.nativeEnum()` function works for `as const` objects as well. ⚠️ `as const` requires TypeScript 3.4+\!

const Fruits \= {  
  Apple: "apple",  
  Banana: "banana",  
  Cantaloupe: 3,  
} as const;

const FruitEnum \= z.nativeEnum(Fruits);  
type FruitEnum \= z.infer\<typeof FruitEnum\>; // "apple" | "banana" | 3

FruitEnum.parse("apple"); // passes  
FruitEnum.parse("banana"); // passes  
FruitEnum.parse(3); // passes  
FruitEnum.parse("Cantaloupe"); // fails

You can access the underlying object with the `.enum` property:

FruitEnum.enum.Apple; // "apple"

## **Optionals**

You can make any schema optional with `z.optional()`. This wraps the schema in a `ZodOptional` instance and returns the result.

const schema \= z.optional(z.string());

schema.parse(undefined); // \=\> returns undefined  
type A \= z.infer\<typeof schema\>; // string | undefined

For convenience, you can also call the `.optional()` method on an existing schema.

const user \= z.object({  
  username: z.string().optional(),  
});  
type C \= z.infer\<typeof user\>; // { username?: string | undefined };

You can extract the wrapped schema from a `ZodOptional` instance with `.unwrap()`.

const stringSchema \= z.string();  
const optionalString \= stringSchema.optional();  
optionalString.unwrap() \=== stringSchema; // true

## **Nullables**

Similarly, you can create nullable types with `z.nullable()`.

const nullableString \= z.nullable(z.string());  
nullableString.parse("asdf"); // \=\> "asdf"  
nullableString.parse(null); // \=\> null

Or use the `.nullable()` method.

const E \= z.string().nullable(); // equivalent to nullableString  
type E \= z.infer\<typeof E\>; // string | null

Extract the inner schema with `.unwrap()`.

const stringSchema \= z.string();  
const nullableString \= stringSchema.nullable();  
nullableString.unwrap() \=== stringSchema; // true

## **Objects**

// all properties are required by default  
const Dog \= z.object({  
  name: z.string(),  
  age: z.number(),  
});

// extract the inferred type like this  
type Dog \= z.infer\<typeof Dog\>;

// equivalent to:  
type Dog \= {  
  name: string;  
  age: number;  
};

### **`.shape`**

Use `.shape` to access the schemas for a particular key.

Dog.shape.name; // \=\> string schema  
Dog.shape.age; // \=\> number schema

### **`.keyof`**

Use `.keyof` to create a `ZodEnum` schema from the keys of an object schema.

const keySchema \= Dog.keyof();  
keySchema; // ZodEnum\<\["name", "age"\]\>

### **`.extend`**

You can add additional fields to an object schema with the `.extend` method.

const DogWithBreed \= Dog.extend({  
  breed: z.string(),  
});

You can use `.extend` to overwrite fields\! Be careful with this power\!

### **`.merge`**

Equivalent to `A.extend(B.shape)`.

const BaseTeacher \= z.object({ students: z.array(z.string()) });  
const HasID \= z.object({ id: z.string() });

const Teacher \= BaseTeacher.merge(HasID);  
type Teacher \= z.infer\<typeof Teacher\>; // \=\> { students: string\[\], id: string }

If the two schemas share keys, the properties of B overrides the property of A. The returned schema also inherits the "unknownKeys" policy (strip/strict/passthrough) and the catchall schema of B.

### **`.pick/.omit`**

Inspired by TypeScript's built-in `Pick` and `Omit` utility types, all Zod object schemas have `.pick` and `.omit` methods that return a modified version. Consider this Recipe schema:

const Recipe \= z.object({  
  id: z.string(),  
  name: z.string(),  
  ingredients: z.array(z.string()),  
});

To only keep certain keys, use `.pick` .

const JustTheName \= Recipe.pick({ name: true });  
type JustTheName \= z.infer\<typeof JustTheName\>;  
// \=\> { name: string }

To remove certain keys, use `.omit` .

const NoIDRecipe \= Recipe.omit({ id: true });

type NoIDRecipe \= z.infer\<typeof NoIDRecipe\>;  
// \=\> { name: string, ingredients: string\[\] }

### **`.partial`**

Inspired by the built-in TypeScript utility type [Partial](https://www.typescriptlang.org/docs/handbook/utility-types.html#partialtype), the `.partial` method makes all properties optional.

Starting from this object:

const user \= z.object({  
  email: z.string(),  
  username: z.string(),  
});  
// { email: string; username: string }

We can create a partial version:

const partialUser \= user.partial();  
// { email?: string | undefined; username?: string | undefined }

You can also specify which properties to make optional:

const optionalEmail \= user.partial({  
  email: true,  
});  
/\*  
{  
  email?: string | undefined;  
  username: string  
}  
\*/

### **`.deepPartial`**

The `.partial` method is shallow — it only applies one level deep. There is also a "deep" version:

const user \= z.object({  
  username: z.string(),  
  location: z.object({  
    latitude: z.number(),  
    longitude: z.number(),  
  }),  
  strings: z.array(z.object({ value: z.string() })),  
});

const deepPartialUser \= user.deepPartial();

/\*  
{  
  username?: string | undefined,  
  location?: {  
    latitude?: number | undefined;  
    longitude?: number | undefined;  
  } | undefined,  
  strings?: { value?: string}\[\]  
}  
\*/

Important limitation: deep partials only work as expected in hierarchies of objects, arrays, and tuples.

### **`.required`**

Contrary to the `.partial` method, the `.required` method makes all properties required.

Starting from this object:

const user \= z  
  .object({  
    email: z.string(),  
    username: z.string(),  
  })  
  .partial();  
// { email?: string | undefined; username?: string | undefined }

We can create a required version:

const requiredUser \= user.required();  
// { email: string; username: string }

You can also specify which properties to make required:

const requiredEmail \= user.required({  
  email: true,  
});  
/\*  
{  
  email: string;  
  username?: string | undefined;  
}  
\*/

### **`.passthrough`**

By default Zod object schemas strip out unrecognized keys during parsing.

const person \= z.object({  
  name: z.string(),  
});

person.parse({  
  name: "bob dylan",  
  extraKey: 61,  
});  
// \=\> { name: "bob dylan" }  
// extraKey has been stripped

Instead, if you want to pass through unknown keys, use `.passthrough()` .

person.passthrough().parse({  
  name: "bob dylan",  
  extraKey: 61,  
});  
// \=\> { name: "bob dylan", extraKey: 61 }

### **`.strict`**

By default Zod object schemas strip out unrecognized keys during parsing. You can *disallow* unknown keys with `.strict()` . If there are any unknown keys in the input, Zod will throw an error.

const person \= z  
  .object({  
    name: z.string(),  
  })  
  .strict();

person.parse({  
  name: "bob dylan",  
  extraKey: 61,  
});  
// \=\> throws ZodError

### **`.strip`**

You can use the `.strip` method to reset an object schema to the default behavior (stripping unrecognized keys).

### **`.catchall`**

You can pass a "catchall" schema into an object schema. All unknown keys will be validated against it.

const person \= z  
  .object({  
    name: z.string(),  
  })  
  .catchall(z.number());

person.parse({  
  name: "bob dylan",  
  validExtraKey: 61, // works fine  
});

person.parse({  
  name: "bob dylan",  
  validExtraKey: false, // fails  
});  
// \=\> throws ZodError

Using `.catchall()` obviates `.passthrough()` , `.strip()` , or `.strict()`. All keys are now considered "known".

## **Arrays**

const stringArray \= z.array(z.string());

// equivalent  
const stringArray \= z.string().array();

Be careful with the `.array()` method. It returns a new `ZodArray` instance. This means the *order* in which you call methods matters. For instance:

z.string().optional().array(); // (string | undefined)\[\]  
z.string().array().optional(); // string\[\] | undefined

### **`.element`**

Use `.element` to access the schema for an element of the array.

stringArray.element; // \=\> string schema

### **`.nonempty`**

If you want to ensure that an array contains at least one element, use `.nonempty()`.

const nonEmptyStrings \= z.string().array().nonempty();  
// the inferred type is now  
// \[string, ...string\[\]\]

nonEmptyStrings.parse(\[\]); // throws: "Array cannot be empty"  
nonEmptyStrings.parse(\["Ariana Grande"\]); // passes

You can optionally specify a custom error message:

// optional custom error message  
const nonEmptyStrings \= z.string().array().nonempty({  
  message: "Can't be empty\!",  
});

### **`.min/.max/.length`**

z.string().array().min(5); // must contain 5 or more items  
z.string().array().max(5); // must contain 5 or fewer items  
z.string().array().length(5); // must contain 5 items exactly

Unlike `.nonempty()` these methods do not change the inferred type.

## **Tuples**

Unlike arrays, tuples have a fixed number of elements and each element can have a different type.

const athleteSchema \= z.tuple(\[  
  z.string(), // name  
  z.number(), // jersey number  
  z.object({  
    pointsScored: z.number(),  
  }), // statistics  
\]);

type Athlete \= z.infer\<typeof athleteSchema\>;  
// type Athlete \= \[string, number, { pointsScored: number }\]

A variadic ("rest") argument can be added with the `.rest` method.

const variadicTuple \= z.tuple(\[z.string()\]).rest(z.number());  
const result \= variadicTuple.parse(\["hello", 1, 2, 3\]);  
// \=\> \[string, ...number\[\]\];

## **Unions**

Zod includes a built-in `z.union` method for composing "OR" types.

const stringOrNumber \= z.union(\[z.string(), z.number()\]);

stringOrNumber.parse("foo"); // passes  
stringOrNumber.parse(14); // passes

Zod will test the input against each of the "options" in order and return the first value that validates successfully.

For convenience, you can also use the [`.or` method](https://www.npmjs.com/package/zod#or):

const stringOrNumber \= z.string().or(z.number());

Optional string validation:

To validate an optional form input, you can union the desired string validation with an empty string [literal](https://www.npmjs.com/package/zod#literals).

This example validates an input that is optional but needs to contain a [valid URL](https://www.npmjs.com/package/zod#strings):

const optionalUrl \= z.union(\[z.string().url().nullish(), z.literal("")\]);

console.log(optionalUrl.safeParse(undefined).success); // true  
console.log(optionalUrl.safeParse(null).success); // true  
console.log(optionalUrl.safeParse("").success); // true  
console.log(optionalUrl.safeParse("https://zod.dev").success); // true  
console.log(optionalUrl.safeParse("not a valid url").success); // false

## **Discriminated unions**

A discriminated union is a union of object schemas that all share a particular key.

type MyUnion \=  
  | { status: "success"; data: string }  
  | { status: "failed"; error: Error };

Such unions can be represented with the `z.discriminatedUnion` method. This enables faster evaluation, because Zod can check the *discriminator key* (`status` in the example above) to determine which schema should be used to parse the input. This makes parsing more efficient and lets Zod report friendlier errors.

With the basic union method, the input is tested against each of the provided "options", and in the case of invalidity, issues for all the "options" are shown in the zod error. On the other hand, the discriminated union allows for selecting just one of the "options", testing against it, and showing only the issues related to this "option".

const myUnion \= z.discriminatedUnion("status", \[  
  z.object({ status: z.literal("success"), data: z.string() }),  
  z.object({ status: z.literal("failed"), error: z.instanceof(Error) }),  
\]);

myUnion.parse({ status: "success", data: "yippie ki yay" });

You can extract a reference to the array of schemas with the `.options` property.

myUnion.options; // \[ZodObject\<...\>, ZodObject\<...\>\]

To merge two or more discriminated unions, use `.options` with destructuring.

const A \= z.discriminatedUnion("status", \[  
  /\* options \*/  
\]);  
const B \= z.discriminatedUnion("status", \[  
  /\* options \*/  
\]);

const AB \= z.discriminatedUnion("status", \[...A.options, ...B.options\]);

## **Records**

Record schemas are used to validate types such as `Record<string, number>`. This is particularly useful for storing or caching items by ID.

const User \= z.object({ name: z.string() });

const UserStore \= z.record(z.string(), User);  
type UserStore \= z.infer\<typeof UserStore\>;  
// \=\> Record\<string, { name: string }\>

The schema and inferred type can be used like so:

const userStore: UserStore \= {};

userStore\["77d2586b-9e8e-4ecf-8b21-ea7e0530eadd"\] \= {  
  name: "Carlotta",  
}; // passes

userStore\["77d2586b-9e8e-4ecf-8b21-ea7e0530eadd"\] \= {  
  whatever: "Ice cream sundae",  
}; // TypeError

A note on numerical keys

While `z.record(keyType, valueType)` is able to accept numerical key types and TypeScript's built-in Record type is `Record<KeyType, ValueType>`, it's hard to represent the TypeScript type `Record<number, any>` in Zod.

As it turns out, TypeScript's behavior surrounding `[k: number]` is a little unintuitive:

const testMap: { \[k: number\]: string } \= {  
  1: "one",  
};

for (const key in testMap) {  
  console.log(\`${key}: ${typeof key}\`);  
}  
// prints: \`1: string\`

As you can see, JavaScript automatically casts all object keys to strings under the hood. Since Zod is trying to bridge the gap between static and runtime types, it doesn't make sense to provide a way of creating a record schema with numerical keys, since there's no such thing as a numerical key in runtime JavaScript.

## **Maps**

const stringNumberMap \= z.map(z.string(), z.number());

type StringNumberMap \= z.infer\<typeof stringNumberMap\>;  
// type StringNumberMap \= Map\<string, number\>

## **Sets**

const numberSet \= z.set(z.number());  
type NumberSet \= z.infer\<typeof numberSet\>;  
// type NumberSet \= Set\<number\>

Set schemas can be further constrained with the following utility methods.

z.set(z.string()).nonempty(); // must contain at least one item  
z.set(z.string()).min(5); // must contain 5 or more items  
z.set(z.string()).max(5); // must contain 5 or fewer items  
z.set(z.string()).size(5); // must contain 5 items exactly

## **Intersections**

Intersections are useful for creating "logical AND" types. This is useful for intersecting two object types.

const Person \= z.object({  
  name: z.string(),  
});

const Employee \= z.object({  
  role: z.string(),  
});

const EmployedPerson \= z.intersection(Person, Employee);

// equivalent to:  
const EmployedPerson \= Person.and(Employee);

Though in many cases, it is recommended to use `A.merge(B)` to merge two objects. The `.merge` method returns a new `ZodObject` instance, whereas `A.and(B)` returns a less useful `ZodIntersection` instance that lacks common object methods like `pick` and `omit`.

const a \= z.union(\[z.number(), z.string()\]);  
const b \= z.union(\[z.number(), z.boolean()\]);  
const c \= z.intersection(a, b);

type c \= z.infer\<typeof c\>; // \=\> number

## **Recursive types**

You can define a recursive schema in Zod, but because of a limitation of TypeScript, their type can't be statically inferred. Instead you'll need to define the type definition manually, and provide it to Zod as a "type hint".

const baseCategorySchema \= z.object({  
  name: z.string(),  
});

type Category \= z.infer\<typeof baseCategorySchema\> & {  
  subcategories: Category\[\];  
};

const categorySchema: z.ZodType\<Category\> \= baseCategorySchema.extend({  
  subcategories: z.lazy(() \=\> categorySchema.array()),  
});

categorySchema.parse({  
  name: "People",  
  subcategories: \[  
    {  
      name: "Politicians",  
      subcategories: \[  
        {  
          name: "Presidents",  
          subcategories: \[\],  
        },  
      \],  
    },  
  \],  
}); // passes

Thanks to [crasite](https://github.com/crasite) for this example.

### **ZodType with ZodEffects**

When using `z.ZodType` with `z.ZodEffects` ( [`.refine`](https://github.com/colinhacks/zod#refine), [`.transform`](https://github.com/colinhacks/zod#transform), [`preprocess`](https://github.com/colinhacks/zod#preprocess), etc... ), you will need to define the input and output types of the schema. `z.ZodType<Output, z.ZodTypeDef, Input>`

const isValidId \= (id: string): id is \`${string}/${string}\` \=\>  
  id.split("/").length \=== 2;

const baseSchema \= z.object({  
  id: z.string().refine(isValidId),  
});

type Input \= z.input\<typeof baseSchema\> & {  
  children: Input\[\];  
};

type Output \= z.output\<typeof baseSchema\> & {  
  children: Output\[\];  
};

const schema: z.ZodType\<Output, z.ZodTypeDef, Input\> \= baseSchema.extend({  
  children: z.lazy(() \=\> schema.array()),  
});

Thanks to [marcus13371337](https://github.com/marcus13371337) and [JoelBeeldi](https://github.com/JoelBeeldi) for this example.

### **JSON type**

If you want to validate any JSON value, you can use the snippet below.

const literalSchema \= z.union(\[z.string(), z.number(), z.boolean(), z.null()\]);  
type Literal \= z.infer\<typeof literalSchema\>;  
type Json \= Literal | { \[key: string\]: Json } | Json\[\];  
const jsonSchema: z.ZodType\<Json\> \= z.lazy(() \=\>  
  z.union(\[literalSchema, z.array(jsonSchema), z.record(jsonSchema)\])  
);

jsonSchema.parse(data);

Thanks to [ggoodman](https://github.com/ggoodman) for suggesting this.

### **Cyclical objects**

Despite supporting recursive schemas, passing cyclical data into Zod will cause an infinite loop in some cases.

To detect cyclical objects before they cause problems, consider [this approach](https://gist.github.com/colinhacks/d35825e505e635df27cc950776c5500b).

## **Promises**

const numberPromise \= z.promise(z.number());

"Parsing" works a little differently with promise schemas. Validation happens in two parts:

1. Zod synchronously checks that the input is an instance of Promise (i.e. an object with `.then` and `.catch` methods.).  
2. Zod uses `.then` to attach an additional validation step onto the existing Promise. You'll have to use `.catch` on the returned Promise to handle validation failures.

numberPromise.parse("tuna");  
// ZodError: Non-Promise type: string

numberPromise.parse(Promise.resolve("tuna"));  
// \=\> Promise\<number\>

const test \= async () \=\> {  
  await numberPromise.parse(Promise.resolve("tuna"));  
  // ZodError: Non-number type: string

  await numberPromise.parse(Promise.resolve(3.14));  
  // \=\> 3.14  
};

## **Instanceof**

You can use `z.instanceof` to check that the input is an instance of a class. This is useful to validate inputs against classes that are exported from third-party libraries.

class Test {  
  name: string;  
}

const TestSchema \= z.instanceof(Test);

const blob: any \= "whatever";  
TestSchema.parse(new Test()); // passes  
TestSchema.parse(blob); // throws

## **Functions**

Zod also lets you define "function schemas". This makes it easy to validate the inputs and outputs of a function without intermixing your validation code and "business logic".

You can create a function schema with `z.function(args, returnType)` .

const myFunction \= z.function();

type myFunction \= z.infer\<typeof myFunction\>;  
// \=\> ()=\>unknown

Define inputs and outputs.

const myFunction \= z  
  .function()  
  .args(z.string(), z.number()) // accepts an arbitrary number of arguments  
  .returns(z.boolean());

type myFunction \= z.infer\<typeof myFunction\>;  
// \=\> (arg0: string, arg1: number)=\>boolean

Function schemas have an `.implement()` method which accepts a function and returns a new function that automatically validates its inputs and outputs.

const trimmedLength \= z  
  .function()  
  .args(z.string()) // accepts an arbitrary number of arguments  
  .returns(z.number())  
  .implement((x) \=\> {  
    // TypeScript knows x is a string\!  
    return x.trim().length;  
  });

trimmedLength("sandwich"); // \=\> 8  
trimmedLength(" asdf "); // \=\> 4

If you only care about validating inputs, just don't call the `.returns()` method. The output type will be inferred from the implementation.

You can use the special `z.void()` option if your function doesn't return anything. This will let Zod properly infer the type of void-returning functions. (Void-returning functions actually return undefined.)

const myFunction \= z  
  .function()  
  .args(z.string())  
  .implement((arg) \=\> {  
    return \[arg.length\];  
  });

myFunction; // (arg: string)=\>number\[\]

Extract the input and output schemas from a function schema.

myFunction.parameters();  
// \=\> ZodTuple\<\[ZodString, ZodNumber\]\>

myFunction.returnType();  
// \=\> ZodBoolean

## **Preprocess**

Zod now supports primitive coercion without the need for `.preprocess()`. See the [coercion docs](https://www.npmjs.com/package/zod#coercion-for-primitives) for more information.

Typically Zod operates under a "parse then transform" paradigm. Zod validates the input first, then passes it through a chain of transformation functions. (For more information about transforms, read the [.transform docs](https://www.npmjs.com/package/zod#transform).)

But sometimes you want to apply some transform to the input *before* parsing happens. A common use case: type coercion. Zod enables this with the `z.preprocess()`.

const castToString \= z.preprocess((val) \=\> String(val), z.string());

This returns a `ZodEffects` instance. `ZodEffects` is a wrapper class that contains all logic pertaining to preprocessing, refinements, and transforms.

## **Custom schemas**

You can create a Zod schema for any TypeScript type by using `z.custom()`. This is useful for creating schemas for types that are not supported by Zod out of the box, such as template string literals.

const px \= z.custom\<\`${number}px\`\>((val) \=\> {  
  return typeof val \=== "string" ? /^\\d\+px$/.test(val) : false;  
});

type px \= z.infer\<typeof px\>; // \`${number}px\`

px.parse("42px"); // "42px"  
px.parse("42vw"); // throws;

If you don't provide a validation function, Zod will allow any value. This can be dangerous\!

z.custom\<{ arg: string }\>(); // performs no validation

You can customize the error message and other options by passing a second argument. This parameter works the same way as the params parameter of [`.refine`](https://www.npmjs.com/package/zod#refine).

z.custom\<...\>((val) \=\> ..., "custom error message");

## **Schema methods**

All Zod schemas contain certain methods.

### **`.parse`**

`.parse(data: unknown): T`

Given any Zod schema, you can call its `.parse` method to check `data` is valid. If it is, a value is returned with full type information\! Otherwise, an error is thrown.

IMPORTANT: The value returned by `.parse` is a *deep clone* of the variable you passed in.

const stringSchema \= z.string();

stringSchema.parse("fish"); // \=\> returns "fish"  
stringSchema.parse(12); // throws error

### **`.parseAsync`**

`.parseAsync(data:unknown): Promise<T>`

If you use asynchronous [refinements](https://www.npmjs.com/package/zod#refine) or [transforms](https://www.npmjs.com/package/zod#transform) (more on those later), you'll need to use `.parseAsync`.

const stringSchema \= z.string().refine(async (val) \=\> val.length \<= 8);

await stringSchema.parseAsync("hello"); // \=\> returns "hello"  
await stringSchema.parseAsync("hello world"); // \=\> throws error

### **`.safeParse`**

`.safeParse(data:unknown): { success: true; data: T; } | { success: false; error: ZodError; }`

If you don't want Zod to throw errors when validation fails, use `.safeParse`. This method returns an object containing either the successfully parsed data or a ZodError instance containing detailed information about the validation problems.

stringSchema.safeParse(12);  
// \=\> { success: false; error: ZodError }

stringSchema.safeParse("billie");  
// \=\> { success: true; data: 'billie' }

The result is a *discriminated union*, so you can handle errors very conveniently:

const result \= stringSchema.safeParse("billie");  
if (\!result.success) {  
  // handle error then return  
  result.error;  
} else {  
  // do something  
  result.data;  
}

### **`.safeParseAsync`**

Alias: `.spa`

An asynchronous version of `safeParse`.

await stringSchema.safeParseAsync("billie");

For convenience, this has been aliased to `.spa`:

await stringSchema.spa("billie");

### **`.refine`**

`.refine(validator: (data:T)=>any, params?: RefineParams)`

Zod lets you provide custom validation logic via *refinements*. (For advanced features like creating multiple issues and customizing error codes, see [`.superRefine`](https://www.npmjs.com/package/zod#superrefine).)

Zod was designed to mirror TypeScript as closely as possible. But there are many so-called "refinement types" you may wish to check for that can't be represented in TypeScript's type system. For instance: checking that a number is an integer or that a string is a valid email address.

For example, you can define a custom validation check on *any* Zod schema with `.refine` :

const myString \= z.string().refine((val) \=\> val.length \<= 255, {  
  message: "String can't be more than 255 characters",  
});

⚠️ Refinement functions should not throw. Instead they should return a falsy value to signal failure.

#### **Arguments**

As you can see, `.refine` takes two arguments.

1. The first is the validation function. This function takes one input (of type `T` — the inferred type of the schema) and returns `any`. Any truthy value will pass validation. (Prior to zod@1.6.2 the validation function had to return a boolean.)  
2. The second argument accepts some options. You can use this to customize certain error-handling behavior:

type RefineParams \= {  
  // override error message  
  message?: string;

  // appended to error path  
  path?: (string | number)\[\];

  // params object you can use to customize message  
  // in error map  
  params?: object;  
};

For advanced cases, the second argument can also be a function that returns `RefineParams`.

const longString \= z.string().refine(  
  (val) \=\> val.length \> 10,  
  (val) \=\> ({ message: \`${val} is not more than 10 characters\` })  
);

#### **Customize error path**

const passwordForm \= z  
  .object({  
    password: z.string(),  
    confirm: z.string(),  
  })  
  .refine((data) \=\> data.password \=== data.confirm, {  
    message: "Passwords don't match",  
    path: \["confirm"\], // path of error  
  });

passwordForm.parse({ password: "asdf", confirm: "qwer" });

Because you provided a `path` parameter, the resulting error will be:

ZodError {  
  issues: \[{  
    "code": "custom",  
    "path": \[ "confirm" \],  
    "message": "Passwords don't match"  
  }\]  
}

#### **Asynchronous refinements**

Refinements can also be async:

const userId \= z.string().refine(async (id) \=\> {  
  // verify that ID exists in database  
  return true;  
});

⚠️ If you use async refinements, you must use the `.parseAsync` method to parse data\! Otherwise Zod will throw an error.

#### **Relationship to transforms**

Transforms and refinements can be interleaved:

z.string()  
  .transform((val) \=\> val.length)  
  .refine((val) \=\> val \> 25);

### **`.superRefine`**

The `.refine` method is actually syntactic sugar atop a more versatile (and verbose) method called `superRefine`. Here's an example:

const Strings \= z.array(z.string()).superRefine((val, ctx) \=\> {  
  if (val.length \> 3) {  
    ctx.addIssue({  
      code: z.ZodIssueCode.too\_big,  
      maximum: 3,  
      type: "array",  
      inclusive: true,  
      message: "Too many items 😡",  
    });  
  }

  if (val.length \!== new Set(val).size) {  
    ctx.addIssue({  
      code: z.ZodIssueCode.custom,  
      message: \`No duplicates allowed.\`,  
    });  
  }  
});

You can add as many issues as you like. If `ctx.addIssue` is *not* called during the execution of the function, validation passes.

Normally refinements always create issues with a `ZodIssueCode.custom` error code, but with `superRefine` it's possible to throw issues of any `ZodIssueCode`. Each issue code is described in detail in the Error Handling guide: [ERROR\_HANDLING.md](https://github.com/colinhacks/zod/blob/HEAD/ERROR_HANDLING.md).

#### **Abort early**

By default, parsing will continue even after a refinement check fails. For instance, if you chain together multiple refinements, they will all be executed. However, it may be desirable to *abort early* to prevent later refinements from being executed. To achieve this, pass the `fatal` flag to `ctx.addIssue` and return `z.NEVER`.

const schema \= z.number().superRefine((val, ctx) \=\> {  
  if (val \< 10) {  
    ctx.addIssue({  
      code: z.ZodIssueCode.custom,  
      message: "should be \>= 10",  
      fatal: true,  
    });

    return z.NEVER;  
  }

  if (val \!== 12) {  
    ctx.addIssue({  
      code: z.ZodIssueCode.custom,  
      message: "should be twelve",  
    });  
  }  
});

#### **Type refinements**

If you provide a [type predicate](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#using-type-predicates) to `.refine()` or `.superRefine()`, the resulting type will be narrowed down to your predicate's type. This is useful if you are mixing multiple chained refinements and transformations:

const schema \= z  
  .object({  
    first: z.string(),  
    second: z.number(),  
  })  
  .nullable()  
  .superRefine((arg, ctx): arg is { first: string; second: number } \=\> {  
    if (\!arg) {  
      ctx.addIssue({  
        code: z.ZodIssueCode.custom, // customize your issue  
        message: "object should exist",  
      });  
    }

    return z.NEVER; // The return value is not used, but we need to return something to satisfy the typing  
  })  
  // here, TS knows that arg is not null  
  .refine((arg) \=\> arg.first \=== "bob", "\`first\` is not \`bob\`\!");

⚠️ You must use `ctx.addIssue()` instead of returning a boolean value to indicate whether the validation passes. If `ctx.addIssue` is *not* called during the execution of the function, validation passes.

### **`.transform`**

To transform data after parsing, use the `transform` method.

const stringToNumber \= z.string().transform((val) \=\> val.length);

stringToNumber.parse("string"); // \=\> 6

#### **Chaining order**

Note that `stringToNumber` above is an instance of the `ZodEffects` subclass. It is NOT an instance of `ZodString`. If you want to use the built-in methods of `ZodString` (e.g. `.email()`) you must apply those methods *before* any transforms.

const emailToDomain \= z  
  .string()  
  .email()  
  .transform((val) \=\> val.split("@")\[1\]);

emailToDomain.parse("colinhacks@example.com"); // \=\> example.com

#### **Validating during transform**

The `.transform` method can simultaneously validate and transform the value. This is often simpler and less duplicative than chaining `transform` and `refine`.

As with `.superRefine`, the transform function receives a `ctx` object with an `addIssue` method that can be used to register validation issues.

const numberInString \= z.string().transform((val, ctx) \=\> {  
  const parsed \= parseInt(val);  
  if (isNaN(parsed)) {  
    ctx.addIssue({  
      code: z.ZodIssueCode.custom,  
      message: "Not a number",  
    });

    // This is a special symbol you can use to  
    // return early from the transform function.  
    // It has type \`never\` so it does not affect the  
    // inferred return type.  
    return z.NEVER;  
  }  
  return parsed;  
});

#### **Relationship to refinements**

Transforms and refinements can be interleaved. These will be executed in the order they are declared.

const nameToGreeting \= z  
  .string()  
  .transform((val) \=\> val.toUpperCase())  
  .refine((val) \=\> val.length \> 15)  
  .transform((val) \=\> \`Hello ${val}\`)  
  .refine((val) \=\> val.indexOf("\!") \=== \-1);

#### **Async transforms**

Transforms can also be async.

const IdToUser \= z  
  .string()  
  .uuid()  
  .transform(async (id) \=\> {  
    return await getUserById(id);  
  });

⚠️ If your schema contains asynchronous transforms, you must use .parseAsync() or .safeParseAsync() to parse data. Otherwise Zod will throw an error.

### **`.default`**

You can use transforms to implement the concept of "default values" in Zod.

const stringWithDefault \= z.string().default("tuna");

stringWithDefault.parse(undefined); // \=\> "tuna"

Optionally, you can pass a function into `.default` that will be re-executed whenever a default value needs to be generated:

const numberWithRandomDefault \= z.number().default(Math.random);

numberWithRandomDefault.parse(undefined); // \=\> 0.4413456736055323  
numberWithRandomDefault.parse(undefined); // \=\> 0.1871840107401901  
numberWithRandomDefault.parse(undefined); // \=\> 0.7223408162401552

Conceptually, this is how Zod processes default values:

1. If the input is `undefined`, the default value is returned  
2. Otherwise, the data is parsed using the base schema

### **`.describe`**

Use `.describe()` to add a `description` property to the resulting schema.

const documentedString \= z  
  .string()  
  .describe("A useful bit of text, if you know what to do with it.");  
documentedString.description; // A useful bit of text…

This can be useful for documenting a field, for example in a JSON Schema using a library like [`zod-to-json-schema`](https://github.com/StefanTerdell/zod-to-json-schema)).

### **`.catch`**

Use `.catch()` to provide a "catch value" to be returned in the event of a parsing error.

const numberWithCatch \= z.number().catch(42);

numberWithCatch.parse(5); // \=\> 5  
numberWithCatch.parse("tuna"); // \=\> 42

Optionally, you can pass a function into `.catch` that will be re-executed whenever a default value needs to be generated. A `ctx` object containing the caught error will be passed into this function.

const numberWithRandomCatch \= z.number().catch((ctx) \=\> {  
  ctx.error; // the caught ZodError  
  return Math.random();  
});

numberWithRandomCatch.parse("sup"); // \=\> 0.4413456736055323  
numberWithRandomCatch.parse("sup"); // \=\> 0.1871840107401901  
numberWithRandomCatch.parse("sup"); // \=\> 0.7223408162401552

Conceptually, this is how Zod processes "catch values":

1. The data is parsed using the base schema  
2. If the parsing fails, the "catch value" is returned

### **`.optional`**

A convenience method that returns an optional version of a schema.

const optionalString \= z.string().optional(); // string | undefined

// equivalent to  
z.optional(z.string());

### **`.nullable`**

A convenience method that returns a nullable version of a schema.

const nullableString \= z.string().nullable(); // string | null

// equivalent to  
z.nullable(z.string());

### **`.nullish`**

A convenience method that returns a "nullish" version of a schema. Nullish schemas will accept both `undefined` and `null`. Read more about the concept of "nullish" [in the TypeScript 3.7 release notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-7.html#nullish-coalescing).

const nullishString \= z.string().nullish(); // string | null | undefined

// equivalent to  
z.string().nullable().optional();

### **`.array`**

A convenience method that returns an array schema for the given type:

const stringArray \= z.string().array(); // string\[\]

// equivalent to  
z.array(z.string());

### **`.promise`**

A convenience method for promise types:

const stringPromise \= z.string().promise(); // Promise\<string\>

// equivalent to  
z.promise(z.string());

### **`.or`**

A convenience method for [union types](https://www.npmjs.com/package/zod#unions).

const stringOrNumber \= z.string().or(z.number()); // string | number

// equivalent to  
z.union(\[z.string(), z.number()\]);

### **`.and`**

A convenience method for creating intersection types.

const nameAndAge \= z  
  .object({ name: z.string() })  
  .and(z.object({ age: z.number() })); // { name: string } & { age: number }

// equivalent to  
z.intersection(z.object({ name: z.string() }), z.object({ age: z.number() }));

### **`.brand`**

`.brand<T>() => ZodBranded<this, B>`

TypeScript's type system is structural, which means that any two types that are structurally equivalent are considered the same.

type Cat \= { name: string };  
type Dog \= { name: string };

const petCat \= (cat: Cat) \=\> {};  
const fido: Dog \= { name: "fido" };  
petCat(fido); // works fine

In some cases, its can be desirable to simulate *nominal typing* inside TypeScript. For instance, you may wish to write a function that only accepts an input that has been validated by Zod. This can be achieved with *branded types* (AKA *opaque types*).

const Cat \= z.object({ name: z.string() }).brand\<"Cat"\>();  
type Cat \= z.infer\<typeof Cat\>;

const petCat \= (cat: Cat) \=\> {};

// this works  
const simba \= Cat.parse({ name: "simba" });  
petCat(simba);

// this doesn't  
petCat({ name: "fido" });

Under the hood, this works by attaching a "brand" to the inferred type using an intersection type. This way, plain/unbranded data structures are no longer assignable to the inferred type of the schema.

const Cat \= z.object({ name: z.string() }).brand\<"Cat"\>();  
type Cat \= z.infer\<typeof Cat\>;  
// {name: string} & {\[symbol\]: "Cat"}

Note that branded types do not affect the runtime result of `.parse`. It is a static-only construct.

### **`.readonly`**

`.readonly() => ZodReadonly<this>`

This method returns a `ZodReadonly` schema instance that parses the input using the base schema, then calls `Object.freeze()` on the result. The inferred type is also marked as `readonly`.

const schema \= z.object({ name: z.string() }).readonly();  
type schema \= z.infer\<typeof schema\>;  
// Readonly\<{name: string}\>

const result \= schema.parse({ name: "fido" });  
result.name \= "simba"; // error

The inferred type uses TypeScript's built-in readonly types when relevant.

z.array(z.string()).readonly();  
// readonly string\[\]

z.tuple(\[z.string(), z.number()\]).readonly();  
// readonly \[string, number\]

z.map(z.string(), z.date()).readonly();  
// ReadonlyMap\<string, Date\>

z.set(z.string()).readonly();  
// ReadonlySet\<string\>

### **`.pipe`**

Schemas can be chained into validation "pipelines". It's useful for easily validating the result after a `.transform()`:

z.string()  
  .transform((val) \=\> val.length)  
  .pipe(z.number().min(5));

The `.pipe()` method returns a `ZodPipeline` instance.

#### **You can use `.pipe()` to fix common issues with `z.coerce`.**

You can constrain the input to types that work well with your chosen coercion. Then use `.pipe()` to apply the coercion.

without constrained input:

const toDate \= z.coerce.date();

// works intuitively  
console.log(toDate.safeParse("2023-01-01").success); // true

// might not be what you want  
console.log(toDate.safeParse(null).success); // true

with constrained input:

const datelike \= z.union(\[z.number(), z.string(), z.date()\]);  
const datelikeToDate \= datelike.pipe(z.coerce.date());

// still works intuitively  
console.log(datelikeToDate.safeParse("2023-01-01").success); // true

// more likely what you want  
console.log(datelikeToDate.safeParse(null).success); // false

You can also use this technique to avoid coercions that throw uncaught errors.

without constrained input:

const toBigInt \= z.coerce.bigint();

// works intuitively  
console.log(toBigInt.safeParse("42")); // true

// probably not what you want  
console.log(toBigInt.safeParse(null)); // throws uncaught error

with constrained input:

const toNumber \= z.number().or(z.string()).pipe(z.coerce.number());  
const toBigInt \= z.bigint().or(toNumber).pipe(z.coerce.bigint());

// still works intuitively  
console.log(toBigInt.safeParse("42").success); // true

// error handled by zod, more likely what you want  
console.log(toBigInt.safeParse(null).success); // false

## **Guides and concepts**

### **Type inference**

You can extract the TypeScript type of any schema with `z.infer<typeof mySchema>` .

const A \= z.string();  
type A \= z.infer\<typeof A\>; // string

const u: A \= 12; // TypeError  
const u: A \= "asdf"; // compiles

What about transforms?

In reality each Zod schema internally tracks two types: an input and an output. For most schemas (e.g. `z.string()`) these two are the same. But once you add transforms into the mix, these two values can diverge. For instance `z.string().transform(val => val.length)` has an input of `string` and an output of `number`.

You can separately extract the input and output types like so:

const stringToNumber \= z.string().transform((val) \=\> val.length);

// ⚠️ Important: z.infer returns the OUTPUT type\!  
type input \= z.input\<typeof stringToNumber\>; // string  
type output \= z.output\<typeof stringToNumber\>; // number

// equivalent to z.output\!  
type inferred \= z.infer\<typeof stringToNumber\>; // number

### **Writing generic functions**

With TypeScript generics, you can write reusable functions that accept Zod schemas as parameters. This enables you to create custom validation logic, schema transformations, and more, while maintaining type safety and inference.

When attempting to write a function that accepts a Zod schema as an input, it's tempting to try something like this:

function inferSchema\<T\>(schema: z.ZodType\<T\>) {  
  return schema;  
}

This approach is incorrect, and limits TypeScript's ability to properly infer the argument. No matter what you pass in, the type of `schema` will be an instance of `ZodType`.

inferSchema(z.string());  
// \=\> ZodType\<string\>

This approach loses type information, namely *which subclass* the input actually is (in this case, `ZodString`). That means you can't call any string-specific methods like `.min()` on the result of `inferSchema`.

A better approach is to infer *the schema as a whole* instead of merely its inferred type. You can do this with a utility type called `z.ZodTypeAny`.

function inferSchema\<T extends z.ZodTypeAny\>(schema: T) {  
  return schema;  
}

inferSchema(z.string());  
// \=\> ZodString

`ZodTypeAny` is just a shorthand for `ZodType<any, any, any>`, a type that is broad enough to match any Zod schema.

The Result is now fully and properly typed, and the type system can infer the specific subclass of the schema.

#### **Inferring the inferred type**

If you follow the best practice of using `z.ZodTypeAny` as the generic parameter for your schema, you may encounter issues with the parsed data being typed as `any` instead of the inferred type of the schema.

function parseData\<T extends z.ZodTypeAny\>(data: unknown, schema: T) {  
  return schema.parse(data);  
}

parseData("sup", z.string());  
// \=\> any

Due to how TypeScript inference works, it is treating `schema` like a `ZodTypeAny` instead of the inferred type. You can fix this with a type cast using `z.infer`.

function parseData\<T extends z.ZodTypeAny\>(data: unknown, schema: T) {  
  return schema.parse(data) as z.infer\<T\>;  
  //                        ^^^^^^^^^^^^^^ \<- add this  
}

parseData("sup", z.string());  
// \=\> string

#### **Constraining allowable inputs**

The `ZodType` class has three generic parameters.

class ZodType\<  
  Output \= any,  
  Def extends ZodTypeDef \= ZodTypeDef,  
  Input \= Output  
\> { ... }

By constraining these in your generic input, you can limit what schemas are allowable as inputs to your function:

function makeSchemaOptional\<T extends z.ZodType\<string\>\>(schema: T) {  
  return schema.optional();  
}

makeSchemaOptional(z.string());  
// works fine

makeSchemaOptional(z.number());  
// Error: 'ZodNumber' is not assignable to parameter of type 'ZodType\<string, ZodTypeDef, string\>'

### **Error handling**

Zod provides a subclass of Error called `ZodError`. ZodErrors contain an `issues` array containing detailed information about the validation problems.

const result \= z  
  .object({  
    name: z.string(),  
  })  
  .safeParse({ name: 12 });

if (\!result.success) {  
  result.error.issues;  
  /\* \[  
      {  
        "code": "invalid\_type",  
        "expected": "string",  
        "received": "number",  
        "path": \[ "name" \],  
        "message": "Expected string, received number"  
      }  
  \] \*/  
}

For detailed information about the possible error codes and how to customize error messages, check out the dedicated error handling guide: [ERROR\_HANDLING.md](https://github.com/colinhacks/zod/blob/HEAD/ERROR_HANDLING.md)

Zod's error reporting emphasizes *completeness* and *correctness*. If you are looking to present a useful error message to the end user, you should either override Zod's error messages using an error map (described in detail in the Error Handling guide) or use a third-party library like [`zod-validation-error`](https://github.com/causaly/zod-validation-error)

### **Error formatting**

You can use the `.format()` method to convert this error into a nested object.

const result \= z  
  .object({  
    name: z.string(),  
  })  
  .safeParse({ name: 12 });

if (\!result.success) {  
  const formatted \= result.error.format();  
  /\* {  
    name: { \_errors: \[ 'Expected string, received number' \] }  
  } \*/

  formatted.name?.\_errors;  
  // \=\> \["Expected string, received number"\]  
}

## **Comparison**

There are a handful of other widely-used validation libraries, but all of them have certain design limitations that make for a non-ideal developer experience.

### **Joi**

[https://github.com/hapijs/joi](https://github.com/hapijs/joi)

Doesn't support static type inference 😕

### **Yup**

[https://github.com/jquense/yup](https://github.com/jquense/yup)

Yup is a full-featured library that was implemented first in vanilla JS, and later rewritten in TypeScript.

* Supports casting and transforms  
* All object fields are optional by default  
* Missing promise schemas  
* Missing function schemas  
* Missing union & intersection schemas

### **io-ts**

[https://github.com/gcanti/io-ts](https://github.com/gcanti/io-ts)

io-ts is an excellent library by gcanti. The API of io-ts heavily inspired the design of Zod.

In our experience, io-ts prioritizes functional programming purity over developer experience in many cases. This is a valid and admirable design goal, but it makes io-ts particularly hard to integrate into an existing codebase with a more procedural or object-oriented bias. For instance, consider how to define an object with optional properties in io-ts:

import \* as t from "io-ts";

const A \= t.type({  
  foo: t.string,  
});

const B \= t.partial({  
  bar: t.number,  
});

const C \= t.intersection(\[A, B\]);

type C \= t.TypeOf\<typeof C\>;  
// returns { foo: string; bar?: number | undefined }

You must define the required and optional props in separate object validators, pass the optionals through `t.partial` (which marks all properties as optional), then combine them with `t.intersection` .

Consider the equivalent in Zod:

const C \= z.object({  
  foo: z.string(),  
  bar: z.number().optional(),  
});

type C \= z.infer\<typeof C\>;  
// returns { foo: string; bar?: number | undefined }

This more declarative API makes schema definitions vastly more concise.

`io-ts` also requires the use of gcanti's functional programming library `fp-ts` to parse results and handle errors. This is another fantastic resource for developers looking to keep their codebase strictly functional. But depending on `fp-ts` necessarily comes with a lot of intellectual overhead; a developer has to be familiar with functional programming concepts and the `fp-ts` nomenclature to use the library.

* Supports codecs with serialization & deserialization transforms  
* Supports branded types  
* Supports advanced functional programming, higher-kinded types, `fp-ts` compatibility  
* Missing object methods: (pick, omit, partial, deepPartial, merge, extend)  
* Missing nonempty arrays with proper typing (`[T, ...T[]]`)  
* Missing promise schemas  
* Missing function schemas

### **Runtypes**

[https://github.com/runtypes/runtypes](https://github.com/runtypes/runtypes)

Runtypes is focused on ergonomics, with good type inference support.

* Supports "pattern matching": computed properties that distribute over unions  
* Supports branded types  
* Supports template literals  
* Supports conformance to predefined static types  
* Missing object methods: (deepPartial, merge)  
* Missing promise schemas  
* Missing error customization

### **Ow**

[https://github.com/sindresorhus/ow](https://github.com/sindresorhus/ow)

Ow is focused on function input validation. It's a library that makes it easy to express complicated assert statements, but it doesn't let you parse untyped data. They support a much wider variety of types; Zod has a nearly one-to-one mapping with TypeScript's type system, whereas ow lets you validate several highly-specific types out of the box (e.g. `int32Array` , see full list in their README).

If you want to validate function inputs, use function schemas in Zod\! It's a much simpler approach that lets you reuse a function type declaration without repeating yourself (namely, copy-pasting a bunch of ow assertions at the beginning of every function). Also Zod lets you validate your return types as well, so you can be sure there won't be any unexpected data passed downstream.

