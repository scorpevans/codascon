/* @odetovibe-generated */
import type { Template } from "codascon";
import type { User, Greeting, Person } from "../domain-types.js";
import { Command } from "codascon";

export abstract class UserGreeter implements Template<GreetCommand, [], User> {
  /*
  Coder comment
  */
  async execute(subject: User, object: Readonly<Greeting>): Promise<Greeting> {
    // coder comment
    let v1 = 42;
    throw new Error("Not implemented"); // @odetovibe-generated
  }

  // some implementation details
  foo() {
    return "bar";
  }
}

export class UserGreeterCasual extends UserGreeter {}

export class UserGreeterFormal extends UserGreeter {}

export class GreetCommand extends Command<
  Person,
  Greeting,
  Promise<Greeting>,
  [User]
> {
  readonly commandName = "greet" as const;

  resolveUser(
    subject: User,
    object: Readonly<Greeting>,
  ): UserGreeterCasual | UserGreeterFormal {
    throw new Error("Not implemented"); // @odetovibe-generated
  }
}
