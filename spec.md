SPECIFICATION FOR THE POWERSYNC OFFLINE FIRST DEMONSTRATION

a simple but non trivial demo application showcasing how offline enabled apps can be built without the hassle with powersync

its a simple linear like ticket tracker. we will have a list view and a detailed view.
each ticket will have
  - title
  - description
  - assignees
  - comments
  - status
  - links (web urls)

the goal is to showcase the following capabilities

- additive offline changes are fine
  - examples
    - creating tickets
    - adding comments
    - new attachments (with deduping)
    - assign to user (with deduping)
  - preferably show some visual feedback while offline
- some offline deletes are also fine
  - user ticket assignments
  - attachments
  - comments
- any potentially destructive changes can be disabled
  - changing title, description, status
- changing the description
  - rich text, can use crdt

both have a simple linear like tracker ui with a list of tickets and a detail view. manager
