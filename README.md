## Vippy ##

Vippy will manage a set of (M) IP addresses over a set of (N) nodes.  It uses IP multicast to chat amongst the nodes to decide who owns which interface.

### Basic Config ###

    {
      "chat": "224.1.1.1:5007",
      "secret": "knsdfkjnsdfkjnweroib0u3",
      "version": 5,
      "vips": [
        [ { "interface": "e1000g0", "ip": "10.8.3.195/24" } ],
        [ 'node2', { "interface": "e1000g0", "ip": "10.8.99.147/24" } ],
        [ { "interface": "e1000g0", "ip": "10.8.99.149/24" }, 
          { "interface": "e1000g0", "ip": "10.8.3.196/24" } ]
      ],
      "nodes": [
        "node1", "node2"
      ],
      "interval": 0.5,
      "mature": 5,
      "stale": 5,
      "arp-cache": "90",
      "notify": [
        "arp-cache",
        { "interface": "e1000g0", "ip": "10.8.99.149/24" },
        { "interface": "e1000g0", "ip": "10.8.3.1/29" }
      ],
      "management": "/var/run/vippy.socket",
      "logging": {
        "driver": "console",
        "facility": "local7",
        "mask": { "emerg": true, "alert": true, "crit": true, "err": true,
                  "warning": false, "notice": true, "info": false, "debug": false }
      }
    }

It is critical that different vippy nodes agree on their configuration.  The **vips** and **nodes** must all match on all nodes (sans the **interface** attribute).  They must contain all the same preferences, ips and nodes all in the same order or "bad things" will happen.  The node with the highest "version" will domninate the cluster's configuration (all other nodes will adopt their revised config).

#### chat ####

This is the IP multicast address/port on which vippy will communicate.  It will broadcast updates to this address and listen for updates on this address.

#### secret ####

This must be the same on all nodes.  It is used to create a secure hash of the announcement message so that other parties on the network cannot interfere.

#### version ####

The version of the config (this applies to the **vips** and **nodes**, specifically.  As these are changed, the version needs to be incremented.  This allows peers to "graduate" to a new config automatically on change.

#### vips ####

This is an array of Virtual Interface Groups that vippy is responsible for managing.  Each group is a list of Virtual Interfaces (w/ netmask) on a specific system network interface (*e.g.* **{ "interface": "eth0", "10.1.2.3/24" }**.  If multiple Virtual Interfaces are specified, they are still treated as an inseparable group (they move together).

The first item in a Virtual Interface Group list *may* be a string representing the name of a node (from the *nodes* list) that prefers this group.  If a group is preferred, the group will be assigned to to the preferred node if the node is up and active.

#### nodes ####

The list of hosts participating in the configuration.

#### interval ####

The interval (in seconds) between announcements.

#### mature ####

How long (in seconds) a vippy node must be up before it is considered "ready to play."

#### stale ####

How old (in seconds) the latest announcement can be before we consider a node unavailable.

#### arp-cache ####

How often (in seconds) to rescan the local arp-cache for sharing.

#### notify ####

A list of of whom to notify (via gratuitous ARPing) when an interface is added to the local machine. This is specified in the same syntax as Virtual Interfaces, but the **ip** considers the whole network (as determined by the CIDR mask (*e.g. /24*).  The special token "arp-cache* tells vippy to notify everyone in the cluster's collective ARP tables.

#### management ####

The socket on which to listen for management control (via vippyctl).

#### logging ####

Designed around syslog, this tells vippy what and where to log.  vippy ships with a driver called "console" that may be used if "posix" is unavailable.

### Operation ###

Vippy must know the node that it is.  By default it will use the os.hostname(), but if that does not match a named host in the **nodes** list, a different node name may be specified with the **-n** command line option.

    /path/to/vippyd -c /etc/vippy.conf -n node1

### Operation ###

Vippy must know the node that it is.  By default it will use the os.hostname(), but if that does not match a named host in the **nodes** list, a different node name may be specified with the **-n** command line option.

    /path/to/vippyd -c /etc/vippy.conf -n node1

Sending a 'HUP' signal to vippyd will cause it to reread the configuration file and adapt to the newly specified configuration.  You can add or remove nodes and change the vips section; just make sure you bump the version number.

### Plugins ###

Vippy can load plugins, which are just normal node.js programs.  These programs have three important global variables in their context: **config**, **manager**, and **network** which represent the VippyConfig, VippyManager and VippyNetwork instances that are driving the system.

A plugin must listen for the 'stop' message on **config** and shutdown any activity such that Node.js can exit.

    config.on('stop', function() {
        // stop listeners
        // clearIntervals
        // clearTimeouts
        // etc.
    });

Plugins can be used to implement periodic local health-checks:

   var job = setInterval(function() {
     var state = doSomething(); // true or false
     config.active(state, "doSomething");
   }, 5000);

Plugins can also respond to the plumbing and unplumbing of Virtual Interaces by listening to the 'up' and'down' events from either **manager** (representing intention) or **network** (representing virtual network changes).


### vippyctl ###

vippyctl allows you perform basic administrative functions.  If you are not using the default management socket: "/var/run/vippy.socket", then you may specific a **-s /path/to/socket** on the command line.

#### status ####

    /path/to/vippyctl status

Will display the current status of the cluster from the local node's perspective.
