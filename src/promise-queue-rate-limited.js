(function () {
    "use strict";
    var Promise = require("bluebird");

    /**
     * Creates a new rate limited queue. The queue is created with stopped state, i.e. you have to call start() to run jobs.
     * @param {number} maxCallsPerSecond=1 - The rate limit of this queue in maximum calls per seconds which may be executed at any time. Pass values less than 1 to have less than one call per second, e.g. 1/3 for 3 one call in three seconds at maximum.
     * @param logger
     * @constructor
     */
    function PromiseQueue(maxCallsPerSecond, logger) {
        this.maxCallsPerSecond = typeof(maxCallsPerSecond) === "undefined" ? 1 : maxCallsPerSecond;
        this.logger = logger;

        this.tasks = [];
        this.isActive = false;
        this.jobIntervalMillis = 1000 / maxCallsPerSecond;

        this.lastTaskTimestamp = null;
        this.currentTaskTimeoutId = null;
    }

    /**
     * Processes the next task and returns the id of the time used to wait for the next invocation of this method.
     * @private
     */
    PromiseQueue.prototype.updateTaskSchedule = function () {
        if (this.logger && this.logger.debug) {
            this.logger.debug("PromiseQueue.updateTaskSchedule");
        }

        if (this.isEmpty() || this.isStopped()) {
            return;
        }

        const queue = this;

        function processNextTask() {
            if (queue.logger && queue.logger.debug) {
                queue.logger.debug("PromiseQueue.processNextTask", queue.tasks.length);
            }

            var nextTaskItem = queue.tasks.shift();
            if (nextTaskItem) {
                try {
                    const result = nextTaskItem.task.call();

                    if (queue.logger && queue.logger.debug) {
                        queue.logger.debug("Resolving queued promise", result);
                    }

                    nextTaskItem.resolve(result);
                } catch (e) {
                    nextTaskItem.reject(e);
                }
            }
        }

        function scheduleNext(timeoutMillisOverride) {
            if (queue.logger && queue.logger.debug) {
                queue.logger.debug("PromiseQueue.scheduleNext", timeoutMillisOverride);
            }

            if (queue.isEmpty()) {
                queue.currentTaskTimeoutId = null;
                return;
            }

            queue.currentTaskTimeoutId = setTimeout(function () {
                queue.lastTaskTimestamp = Date.now();
                processNextTask();

                scheduleNext(queue.jobIntervalMillis);
            }, timeoutMillisOverride);
        }

        if (this.currentTaskTimeoutId == null) {
            if (this.lastTaskTimestamp) {
                let passedTime = Date.now() - this.lastTaskTimestamp;
                if (passedTime > this.jobIntervalMillis) {
                    scheduleNext(this.jobIntervalMillis);
                } else {
                    scheduleNext(Math.max(0, this.jobIntervalMillis - passedTime));
                }
            } else {
                scheduleNext(0);
            }
        }
    };

    /**
     * Starts the task processing of this queue.
     *
     * If it is already started, then false will be returned.
     * If it is not yet started then the first task will be processed in the background and true will be returned.
     *
     * @return {boolean} true if this queue wasn't started before and now started to process tasks.
     */
    PromiseQueue.prototype.start = function () {
        if (this.isActive) {
            return false;
        }

        this.isActive = true;

        this.updateTaskSchedule();

        return true;
    };

    /**
     * Stops the processing of this queue.
     * @return true if the queue was started and is now stopped. false if it was already stopped.
     */
    PromiseQueue.prototype.stop = function () {
        if (this.isActive) {
            this.isActive = false;

            if (this.currentTaskTimeoutId) {
                clearInterval(this.currentTaskTimeoutId);
                this.currentTaskTimeoutId = null;
                this.lastTaskTimestamp = null;
            }
        }
    };

    PromiseQueue.prototype.getMaxCallsPerSecond = function () {
        return this.maxCallsPerSecond;
    };

    PromiseQueue.prototype.isStarted = function () {
        return this.isActive;
    };

    PromiseQueue.prototype.isStopped = function () {
        return !this.isStarted();
    };

    /**
     * @returns {boolean} true if this queue is currently empty, i.e. if it has no tasks in the queue.
     */
    PromiseQueue.prototype.isEmpty = function () {
        return this.tasks.length === 0;
    };

    /**
     * @returns {boolean} true if this queue has one or more entries.
     */
    PromiseQueue.prototype.isNotEmpty = function () {
        return !this.isEmpty();
    };

    /**
     * @param {function} task - The task to add.
     * @param {boolean} append - if the task should be appended or prepended to the list of queued tasks
     * @return {Promise} A promise which is resolved/rejected when the task was executed by the queue.
     */
    PromiseQueue.prototype.add = function (task, append) {
        var self = this;

        var promise = new Promise(function (resolve, reject) {
            var newTaskItem = {task: task, resolve: resolve, reject: reject};

            if (self.isEmpty() || append) {
                self.tasks.push(newTaskItem);
            } else {
                self.tasks.unshift(newTaskItem);
            }
        });

        self.updateTaskSchedule();

        return promise;
    };

    /**
     * Appends a new task at the end of the queue.
     * @param {function} task - The task to perform. This function will be called with no arguments.
     * @return {Promise} A promise which is resolved/rejected When the task was executed by the queue
     */
    PromiseQueue.prototype.append = function (task) {
        return this.add(task, true);
    };

    /**
     * Adds a new task as first item in the queue.
     * @param task
     * @return {Promise} A promise which is resolved/rejected When the task was executed by the queue
     */
    PromiseQueue.prototype.prepend = function (task) {
        return this.add(task, false);
    };

    /**
     * Removes the task from the qeueue. If the task is contained more than one time then all occurrences will be removed.
     * @param {function} task - The task to remove.
     * @return {number} - The number of items which were removed.
     */
    PromiseQueue.prototype.remove = function (task) {
        if (this.isEmpty()) {
            return 0;
        }

        var removedItems = 0;
        for (var i = this.tasks.length - 1; i >= 0; i--) {
            if (this.tasks[i].task === task) {
                this.tasks.splice(i, 1);
                removedItems++;
            }
        }

        return removedItems;
    };

    /**
     * @returns {Number} - The number of queued/waiting tasks in the queue.
     */
    PromiseQueue.prototype.getQueueSize = function () {
        return this.tasks.length;
    };

    module.exports = PromiseQueue;
})();