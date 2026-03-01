/* @odetovibe-generated */
import { Subject } from "codascon";

export class SubjectTypeEntry extends Subject {
  readonly visitName = "resolveSubjectType" as const;
}

export class PlainTypeEntry extends Subject {
  readonly visitName = "resolvePlainType" as const;
}

export class CommandEntry extends Subject {
  readonly visitName = "resolveCommand" as const;
}

export class AbstractTemplateEntry extends Subject {
  readonly visitName = "resolveAbstractTemplate" as const;
}

export class ConcreteTemplateEntry extends Subject {
  readonly visitName = "resolveConcreteTemplate" as const;
}

export class StrategyEntry extends Subject {
  readonly visitName = "resolveStrategy" as const;
}

export interface ConfigEntry {}

export interface ConfigIndex {}

export interface ValidationError {}

export interface ValidationResult {}

export interface ExtractResult {}
