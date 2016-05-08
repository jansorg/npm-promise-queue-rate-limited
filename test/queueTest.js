var test = require('tape');
var Queue = require('../src/promise-queue-rate-limited.js');

test('A new queue is empty', function (t) {
    t.plan(1);

    t.ok(new Queue().isEmpty(), "A new queue is empty");
});

test('A new queue has a default of one call per seconnd', function (t) {
    t.plan(1);

    t.equals(new Queue().getMaxCallsPerSecond(), 1, "The default should be one call per second");
});

test('A queue can take maxCallsPerSeconcd', function (t) {
    t.plan(2);

    t.equals(new Queue(5).getMaxCallsPerSecond(), 5, "5 calls per second expected");
    t.equals(new Queue(1 / 5).getMaxCallsPerSecond(), 0.2, "5 seconds per task expected");
});

test('A new queue is in stopped state', function (t) {
    t.plan(2);

    t.ok(new Queue().isStopped(), "A new queue is stopped");

    t.notOk(new Queue().isStarted(), "A new queue is stopped");
});

test('Calling appends appends the new tasks', function (t) {
    t.plan(4);

    var q = new Queue();
    t.ok(new Queue().isEmpty(), "A new queue must be empty");

    q.append(function () {
    });
    t.notOk(q.isEmpty(), "A modified queue must not be empty");
    t.equals(q.getQueueSize(), 1, "After append one item must be queued.");

    q.prepend(function () {
    });
    t.equals(q.getQueueSize(), 2, "After prepend one more item must be queued.");
});

test('The promise must be resolved with the tasks result if no error occurrs', function (t) {
    t.plan(2);

    var q = new Queue();

    var successCalled = false;
    var successArg = null;

    q.append(function () {
        return 1;
    }).then(function (result) {
        successCalled = true;
        successArg = result;
    }).finally(function () {
        t.ok(successCalled, "The promise must be resolved");
        t.equals(successArg, 1, "onSuccess must be called with the task's result");
    });

    q.start();
});

test('The promise must be rejected if an error occurrs', function (t) {
    t.plan(3);

    var q = new Queue();

    var successCalled = false;
    var errorCalled = false;
    var errorArg = null;

    q.append(function () {
        throw "ERROR!"
    }).then(function () {
        successCalled = true;
    }).catch(function (e) {
        errorCalled = true;
        errorArg = e;
    }).finally(function () {
        t.notOk(successCalled, "the promise must not be resolved");
        t.ok(errorCalled, "the promise must not be resolved");
        t.equals(errorArg, "ERROR!", "The rejections must have the exception as argument");
    });

    q.start();
});

test("The queue does not execute faster than the specified max calls per second", function (t) {
    t.plan(6 + 30);

    var q = new Queue(5);
    q.start();

    t.ok(q.isStarted(), "The queue must be started");
    t.ok(q.isEmpty(), "The queue must be empty at first");

    var execTimestamps = [];
    var execIds = [];

    for (var i = 0; i < 30; i++) {
        const current = i;
        q.append(function () {
            execTimestamps.push(Date.now());
            execIds.push(current);
        });
    }

    setTimeout(function () {
        t.equals(execTimestamps.length, 30, "All tasks must be executed");
        t.equals(execIds.length, 30, "All tasks must be executed");

        for (var i = 0; i < 30; i++) {
            t.equals(execIds[i], i, "The tasks must be executed in insertion order");
        }

        t.ok(q.isEmpty(), "The queue should be empty by now");

        q.stop();
        t.ok(q.isStopped(), "The queue should be stopped by now");
    }, 6 * 1000);
});

test("Starting after stopped works", function (t) {
    t.plan(4);

    var q = new Queue();

    t.ok(q.isStopped());

    q.start();
    t.ok(q.isStarted());

    q.stop();
    t.ok(q.isStopped());

    q.start();
    t.ok(q.isStarted());
});

test("New jobs in an empty, started queue must be scheduled", function (t) {
    t.plan(6);

    var timestamps = [];

    var q = new Queue(1 / 4);
    q.start();

    q.append(function () {
        console.log("First: " + new Date().toISOString());


        timestamps.push(Date.now());
    });
    t.equals(timestamps.length, 1, "The first task must be executed immediately");
    t.ok((Date.now() - timestamps[0]) <= 150, "The first task must be executed immediately");

    setTimeout(function () {
        //add a new task after one second to be executed after 4 seconds (one task in 4 seconds is executed)
        q.append(function () {
            console.log("Second: " + new Date().toISOString());
            timestamps.push(Date.now());
        });
        t.equals(timestamps.length, 1, "Tasks added after the first add call must be executed scheduled, i.e. not immediately.");
    }, 1000);

    setTimeout(function () {
        t.equals(timestamps.length, 2, "The second task must be scheduled to fit into the first timeout and not timeout after the time of adding it.");
        t.ok((Date.now() - timestamps[1]) <= 300, "The second task must be executed after about 4s: " + (Date.now() - timestamps[1]));
        t.ok(q.isEmpty());
    }, 4200);
});

test("Removing a testk works", function (t) {
    t.plan(2);

    var q = new Queue();
    var task = function () {
    };

    q.add(task);
    q.add(task);
    q.add(task);

    var removed = q.remove(task);
    t.equals(removed, 3, "All tasks must have been removed");
    t.ok(q.isEmpty());
});