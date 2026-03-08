/* @odetovibe-generated */
import { Command } from "codascon";
import type { Template } from "codascon";
import type { Person, Greeting, User } from "../domain-types.js";

export class GreetCommand extends Command<Person, Greeting, Greeting, [User]> {
  readonly commandName = "greet" as const;

  resolveUser(
    subject: User,
    object: Readonly<Greeting>,
  ): Template<GreetCommand, [], User> {
    throw new Error("Not implemented"); // @odetovibe-generated
  }
}

export class UserGreeter implements Template<GreetCommand, [], User> {
  /*
  Coder comment
  */
  async execute(subject: User, object: Readonly<Greeting>): Greeting {
    // coder comment
    let v1 = 42;
    throw new Error("Not implemented"); // @odetovibe-generated
  }

  // some implementation details
  foo() {
    return "bar";
  }
}
