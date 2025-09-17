#!/usr/bin/env python3
"""

Consume and print RabbitMQ messages
(Base on mfeit-rabbit-consume.py)

To set up RabbitMQ:

yum -y install python36-pika rabbitmq-server
systemctl enable --now rabbitmq-server


"""

import optparse
import pika
import sys

opt_parser = optparse.OptionParser()

opt_parser.add_option("-H",
                      "--host",
                      help="Host name",
                      action="store", type="string",
                      default="localhost",
                      dest="host")

opt_parser.add_option("-q",
                      "--queue",
                      help="Queue name",
                      action="store", type="string",
                      default="",
                      dest="queue")

opt_parser.add_option("-e",
                      "--exchange",
                      help="Exchange name",
                      action="store", type="string",
                      default="",
                      dest="exchange")

opt_parser.add_option("-v",
                      "--verbose",
                      help="Talk more",
                      action="store_true",
                      dest="verbose")

(options, remaining_args) = opt_parser.parse_args()

if len(remaining_args) != 0:
    print("Unusable arguments: %s" % " ".join(remaining_args))
    exit(1)
    
connection = pika.BlockingConnection(
    pika.ConnectionParameters(host=options.host)
)
channel = connection.channel()

if not options.queue and not options.exchange:
    print("Missing option. Either -e or -q (or both) is required.")
    exit(1)

queue_name = options.queue
if options.exchange:
    channel.exchange_declare(exchange=options.exchange, exchange_type='fanout')
    result = channel.queue_declare(queue=queue_name, exclusive=True)
    # Update queue name in case of one-time-queue-name when only exchange is specified
    queue_name = result.method.queue
    channel.queue_bind(exchange=options.exchange, queue=queue_name)
    if options.verbose: print("Exchange '%s' and queue '%s' declared and bound." % (options.exchange, queue_name)) 
elif options.queue:
    channel.queue_declare(queue=queue_name)
    if options.verbose: print("Default exchange and queue '%s' declared." % queue_name) 
    
def callback(_ch, _method, _properties, body):
    if options.verbose:
        print("\nReceived %s\n" % (body.decode("ascii")))
    else:
        print("%s" % (body.decode("ascii")))
    # Acknowledge the rmq-message manually
    _ch.basic_ack(delivery_tag=_method.delivery_tag)

        
try:
    channel.basic_consume(queue_name, callback)
except:
    # Apply legacy order of arguments
    channel.basic_consume(callback, queue_name)

if options.verbose:
    print("Listening on %s:%s/%s ..." % (options.host, options.exchange, queue_name) ) 
    print("[Ctrl-C to end]") 
        
try:
    channel.start_consuming()
except KeyboardInterrupt:
    pass

exit(99)
