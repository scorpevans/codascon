/* @odetovibe-generated */
import type { Template, CommandSubjectUnion } from "codascon";
import type { User, Greeting, Guest, Person } from "../domain-types.js";
import { Command } from "codascon";

abstract class UserFarewell implements Template<FarewellCommand, [], User> {
  execute(subject: User, object: Readonly<Greeting>): Greeting {
    throw new Error("Not implemented"); // @odetovibe-generated
  }
}

class UserFarewellDefault extends UserFarewell {}

abstract class GuestFarewell implements Template<
  FarewellCommand,
  [],
  CommandSubjectUnion<FarewellCommand>
> {
  execute(
    subject: CommandSubjectUnion<FarewellCommand>,
    object: Readonly<Greeting>,
  ): Greeting {
    throw new Error("Not implemented"); // @odetovibe-generated
  }
}

class GuestFarewellDefault extends GuestFarewell {}

export class FarewellCommand extends Command<
  Person,
  Greeting,
  Greeting,
  [User, Guest]
> {
  readonly commandName = "farewell" as const;
  private readonly userFarewellDefault = new UserFarewellDefault();
  private readonly guestFarewellDefault = new GuestFarewellDefault();

  resolveUser(
    subject: User,
    object: Readonly<Greeting>,
  ): Template<FarewellCommand, [], User> {
    return this.userFarewellDefault; // @odetovibe-generated
  }

  readonly defaultResolver: GuestFarewellDefault = this.guestFarewellDefault;
}
