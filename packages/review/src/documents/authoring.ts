import {
  databaseLensSchema,
  frameSchema,
  sequenceSchema,
} from "@review/documents/document";
import { diffSelectionSchema } from "@review/documents/lens-selection";
import { tutorialAuthoringConversationSchema } from "@review/documents/tutorial-conversation";
import type { SoftwareDataStoreFieldSchema } from "@review/software-map/software-map-model";
import { z } from "zod";

export {
  tutorialAuthoringConversationSchema,
  type TutorialAuthoringConversation,
} from "@review/documents/tutorial-conversation";

const nonEmptyStringSchema = z
  .string()
  .refine((value) => value.trim().length > 0, "Must not be empty");

const optionalNonEmptyStringSchema = nonEmptyStringSchema.optional();

export const anchorRefSchema = z.strictObject({
  __kind: z.literal("db-anchor-ref"),
  id: nonEmptyStringSchema,
  title: nonEmptyStringSchema,
  detail: optionalNonEmptyStringSchema,
  peek: diffSelectionSchema.optional(),
  softwareMapPath: optionalNonEmptyStringSchema,
});

export type AnchorRef = z.infer<typeof anchorRefSchema>;

export const peekableAnchorRefSchema = anchorRefSchema.extend({
  peek: diffSelectionSchema,
});

export type PeekableAnchorRef = z.infer<typeof peekableAnchorRefSchema>;

const softwareDataStoreForeignKeyRefSchema = z.union([
  nonEmptyStringSchema,
  z.strictObject({
    store: optionalNonEmptyStringSchema,
    table: nonEmptyStringSchema,
    field: nonEmptyStringSchema,
    label: optionalNonEmptyStringSchema,
    cardinality: z.enum(["one-to-one", "many-to-one"]).optional(),
    onDelete: optionalNonEmptyStringSchema,
    onUpdate: optionalNonEmptyStringSchema,
  }),
]);

const softwareDataStoreFieldSchema: z.ZodType<SoftwareDataStoreFieldSchema> =
  z.lazy(() =>
    z.record(
      nonEmptyStringSchema,
      z.union([
        z.strictObject({
          type: nonEmptyStringSchema,
          example: z.unknown().optional(),
          pk: z.boolean().optional(),
          fk: softwareDataStoreForeignKeyRefSchema.optional(),
          schema: softwareDataStoreFieldSchema.optional(),
        }),
        softwareDataStoreFieldSchema,
      ]),
    ),
  );

export const softwareDataStoreCollectionInputSchema = z.strictObject({
  label: optionalNonEmptyStringSchema,
  key: optionalNonEmptyStringSchema,
  schema: softwareDataStoreFieldSchema,
});

// The shared renderer component props. Anchors carry plain source ranges;
// diagrams carry the canonical block data.
export const reviewComponentDataSchemas = {
  AnchorLink: z.strictObject({ anchor: peekableAnchorRefSchema }),
  CallStackDiff: z.strictObject({
    title: optionalNonEmptyStringSchema,
    base: z.array(frameSchema),
    head: z.array(frameSchema),
  }),
  CodePeek: z.strictObject({ anchor: peekableAnchorRefSchema }),
  DatabaseLens: z.strictObject({
    id: nonEmptyStringSchema,
    title: optionalNonEmptyStringSchema,
    height: z.number().positive().optional(),
    actors: databaseLensSchema.shape.actors,
    stores: databaseLensSchema.shape.stores,
    useCases: databaseLensSchema.shape.useCases,
  }),
  ReviewSection: z.strictObject({
    title: nonEmptyStringSchema,
    defaultCollapsed: z.boolean().optional(),
  }),
  SequenceDiagram: z.strictObject({
    id: nonEmptyStringSchema,
    title: sequenceSchema.shape.title,
    actors: sequenceSchema.shape.actors,
    steps: sequenceSchema.shape.steps,
  }),

  TutorialAuthoringConversation: z.strictObject({
    conversation: tutorialAuthoringConversationSchema,
  }),
  TutorialFeature: z.strictObject({ feature: z.literal("softwareMap") }),
  TutorialKeymapPicker: z.strictObject({}),
  TutorialViewButton: z.strictObject({
    view: z.enum(["review", "commits", "diff", "map"]),
  }),
};

/** The components the review renderer can display. */
export type ReviewDocumentComponentName =
  keyof typeof reviewComponentDataSchemas;

export type ReviewComponentProps<Name extends ReviewDocumentComponentName> =
  z.infer<(typeof reviewComponentDataSchemas)[Name]>;
