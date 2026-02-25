# Offline-First Apps with TanStack DB and PowerSync

Offline-first apps are web/native applications that can be used while the user's device is offline.

In my previous post, I presented some parameters of an ideal sync engine:

- simple to integrate  
- stable and mature  
- pluggable into existing setups  
- low lock-in  
- runs everywhere  
- enterprise compliance-ready  
- offline-first

In this blog post, I want to focus on what building offline-first applications looks like with PowerSync and TanStack DB.

## The Hassle of Offline

Building applications that can work offline is a difficult problem for many reasons.

1. Traditional approaches (REST, GraphQL etc) only provide a way to access data over the network  
2. Web storage APIs are very low-level and difficult to use for non trivial tasks  
3. Keeping a consistent local cache in sync with the server is a difficult distributed systems problem  
4. The state management logic starts duplicating backend logic and gets complicated and inefficient  
5. Changes made offline can result in conflicts with server data, requiring manual resolution

Most sync engines today solve the first 4 problems relatively well

1. Data access against a local in-memory database  
2. Automatic durable storage in the file system or IndexedDB  
3. Consistent and glitch-free synchronization  
4. Reactive queries for expressive and composable state management

This is an **architectural guarantee** offered by sync engines: *Users can read their data instantly and consistently at any point in time, even if they are offline*.

Even though the client cannot receive updates while offline, they can read a consistent snapshot of the data as it was right before the client went offline.

But when it comes to making changes offline in a real-time and multi-user environment, there is the possibility of conflicts. A conflict arises when two users change the same piece of data in different ways. Ways that cannot be reconciled with each other, where only one can be kept and the other has to be discarded. How does the system decide which change should be kept?

## Theoretical vs Practical

The theory that comes from distributed systems research rightly claims that when two stateful nodes are disconnected from each other, changes/transactions can never be put on a single timeline since computers have unreliable clocks.

This means that allowing users to change data while offline is, theoretically speaking, a recipe for disaster.

Lets walk through some scenarios where an offline user makes changes to the data.

1. A user that goes offline works on a subset of the data that has no overlap with the data that other users are changing at the same time. This is fine.  
2. A user that goes offline collaborates with another user on the data but changes different parts/fields than the other user. This is also fine.  
3. A user goes offline and changes something another user is changing at the same time. Oops, conflict\!

We can imagine scenario \#3 more concretely:

![][image1]

Some data starts with the value of A. Someone goes offline and changes it to C, while another online user changes it to B. Once the offline user comes back online, the value might get changed to C, losing the change made by the online user.

The simplest solution to this problem of conflicts is to disable writing to the database offline completely. As the famous saying goes, “in a distributed system, anything that **can** go wrong **will** go wrong”.

No offline writes \=== \#3 can’t happen \=== no conflicts\!

While this approach is completely sound, let's take a more practical look at this issue, informed by our experience helping build offline-first apps across hundreds of use cases and dozens of industries since 2009\.

**Most** offline use cases actually look like \#1 and \#2.

So a more practical solution to the problem of conflicts would allow for these use cases by default, and provide a way to opt into custom conflict resolution or opt out of offline writes.

Let's walk through a demo to understand this well.

## Demo

This is a simple ticket tracking app with certain offline capabilities.

**\---screenshot of ticket list view---**

Users have access to a shared list of tickets that they work on. For the most part, it's just basic CRUD operations.

There are certain operations that can be performed offline that have no way of running into conflicts.

- Creating new tickets  
- Adding/removing user assignments from tickets  
- Adding/removing comments  
- Adding/removing attachments

**\---video showing these flows at once---**

Other operations like changes to title, description, and status are *usually* safe to do.

**\---video showing changing these fields at once---**

This is the behavior we get with the simplest and default way to integrate PowerSync with an application backend:

**\---show code for uploadData---**

The server simply processes writes in the order it receives them, which means any changes made while offline are sent to the server and processed as if they happened at that point in time.

## Designing for Conflicts

While last-write-wins is a sensible default for most use cases, it's not possible to get rid of conflict resolution issues entirely if we are to allow users to make offline changes. Therefore it's important to know when and how to design for conflicts.

There are many strategies for avoiding conflicts in offline-first apps that range from simple to complicated.

### Disable Destructive Actions

The simplest way to avoid conflicts is to disallow certain destructive operations while offline. This is not the same thing as making the entire app read-only when offline. As discussed earlier, there are always certain operations that don't run into conflicts and are fine to do offline.

**\---show example of title status description fields disabled offline---**

This approach trades off a user-facing capability (making changes while offline) for operational simplicity (no conflicts possible).

### Audit/Activity Log

Quite often a last-write-wins strategy is a perfectly acceptable solution as long as the history of changes is visible to the users.

**\---show example of a lightweight activity log showing changes made to a ticket over time---**

This activity log is as simple as an additional database table that is written to in the same transaction as the actual change to the ticket.

**\---show code for transaction---**

### Domain-Specific Resolution

Let's imagine while I am offline, someone changes this ticket from `pending` to `done`. But since I was offline, I didn't see that change. I separately change the status from `pending` to `in progress`.

**\---demo with split screen---**

While the default last-write-wins strategy would say that the final status once I come back online should be `in progress`, it might make sense in this scenario to keep the ticket status as `done` rather than overriding.

This is not necessarily a technical decision — it should be up to the product/business to decide how conflicts like these resolve.

**\---show code for conflict detection and resolution---**

Here we can detect the case when an offline user syncs with a pending change to the status field.

This approach can provide automatic and predictable conflict resolution, but it's not a general solution and the actual logic of making a decision is going to vary a lot for different use cases.

### Manual Resolution

A more general solution is to simply notify a user and let them decide how to proceed.

This usually involves tracking conflicts separately and prompting the user to provide a resolution by comparing the changes made.

**\---show video walking through manual resolution flow---**

Manual resolution is a good choice for the most sensitive parts of the apps. There is some initial overhead in building the UI for manual resolution, but once the UI is there it can be used for any conflict scenario throughout the app. It is also the safest way to deal with conflicts, even though it might have a negative impact on the user experience by forcing users through an extra conflict resolution step. On the downside, this is one of the more complicated strategies on this list.

### CRDT/OT

To handle conflicts on collaborative data like a document or canvas editor, it's best to use either an Operational Transform (OT) approach or a Conflict-free Replicated Data Type (CRDT).

Both of these approaches allow people to make changes to a document offline and have them automatically be merged into concurrent changes. OT requires a server to coordinate and transform changes, while CRDTs can be used fully locally.

**\---show video of multiplayer editing of ticket description---**

Automerge and Yjs are some of the popular CRDT libraries with a simple interface. This example uses Yjs to construct the CRDT on the client side by reading deltas from a database table.

**\---show code for ticket description using yjs---**

While CRDT/OT can automatically handle any complexity of conflicts, it doesn't mean its final output will be what the users actually want, especially if there have been massive conflicting changes. These are algorithms that guarantee a resolution, not that you will like the resolution. In those cases, it's best to combine a CRDT/OT approach with manual resolution — show not just the conflicting changes, but the CRDT merge as a possible solution, and let the user make final edits before resolving the conflict.

## Optionality

As we walk through the various possible approaches to conflict resolution, it's important to keep in mind that very few applications will genuinely need to handle all these cases. However, almost every application has some features that can be used offline, and it is important for the tools we use to scale and support these needs as they come along. This is the pragmatic reality of building offline-first applications that PowerSync addresses. It provides a sensible default that satisfies the majority of use cases, while making it simple to opt-in to more advanced strategies as needed.

## \<CTA\>

## References

[https://supabase.com/blog/postgres-crdt\#offline-philosophy](https://supabase.com/blog/postgres-crdt#offline-philosophy)   
[https://www.powersync.com/blog/vue-tutorial-offline-first-todo-app-with-supabase-and-powersync](https://www.powersync.com/blog/vue-tutorial-offline-first-todo-app-with-supabase-and-powersync)  
[https://www.powersync.com/blog/building-offline-first-file-uploads-with-powersync-attachments-helper](https://www.powersync.com/blog/building-offline-first-file-uploads-with-powersync-attachments-helper)  
[https://www.powersync.com/blog/offline-first-apps-made-simple-supabase-powersync](https://www.powersync.com/blog/offline-first-apps-made-simple-supabase-powersync)  
[https://www.powersync.com/blog/local-first-key-concepts-offline-first-vs-local-first](https://www.powersync.com/blog/local-first-key-concepts-offline-first-vs-local-first)  
[https://docs.powersync.com/handling-writes/handling-update-conflicts](https://docs.powersync.com/handling-writes/handling-update-conflicts)  
[https://docs.powersync.com/handling-writes/custom-conflict-resolution](https://docs.powersync.com/handling-writes/custom-conflict-resolution)
